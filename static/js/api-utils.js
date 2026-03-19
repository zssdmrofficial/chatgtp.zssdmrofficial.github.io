async function callApiWithRetry(body, maxRetries = 5) {
  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    console.log(`[API] 嘗試第 ${attempt} 次呼叫...`);

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error(`[API] 錯誤: ${res.status}`, err);

        if (res.status === 400) {
          const errorMsg = err?.error?.message || `HTTP ${res.status}`;
          throw new Error(errorMsg);
        }
        throw new Error(err?.error?.message || `HTTP ${res.status}`);
      }

      console.log(`[API] 成功! 第 ${attempt} 次呼叫返回結果`);
      return await res.json();
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      console.error(`[API] 呼叫失敗 (第 ${attempt} 次):`, e);
      if (
        e.message &&
        (e.message.startsWith('HTTP 400') ||
          e.message.includes('Function calling is not enabled'))
      ) {
        throw e;
      }
      if (attempt >= maxRetries) throw e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('已達最大重試次數仍失敗');
}

async function callApiStreamWithRetry(
  body,
  onChunk,
  maxRetries = 5,
  signal = null,
) {
  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    console.log(`[API Stream] 嘗試第 ${attempt} 次呼叫...`);

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-use-stream': 'true',
        },
        body: JSON.stringify(body),
        signal: signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 400) {
          throw new Error(err?.error?.message || `HTTP ${res.status}`);
        }
        throw new Error(err?.error?.message || `HTTP ${res.status}`);
      }

      console.log(`[API Stream] 成功! 開始解析串流`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      const processStreamData = (dataStr) => {
        if (!dataStr || dataStr === '[DONE]') return;
        try {
          let data = JSON.parse(dataStr);
          let parts = data?.candidates?.[0]?.content?.parts;
          if (parts && Array.isArray(parts)) {
            for (const part of parts) {
              if (part.text || part.thought) {
                let isThought = !!part.thought;
                let thoughtSummary = '';

                if (typeof part.thought === 'object' && part.thought !== null) {
                  isThought = true;
                  thoughtSummary = part.thought.summary || '';
                } else if (part.thought_title) {
                  thoughtSummary = part.thought_title;
                }

                onChunk({
                  text:
                    part.text ||
                    (typeof part.thought === 'string' ? part.thought : ''),
                  isThought: isThought,
                  thoughtSummary: thoughtSummary,
                });
              }
            }
          }
        } catch (e) {}
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) {
            let lines = buffer.split('\n');
            for (let line of lines) {
              let dataStr = line.replace(/^data:\s*/, '').trim();
              processStreamData(dataStr);
            }
          }
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        let lines = buffer.split('\n');
        buffer = lines.pop();

        for (let line of lines) {
          let dataStr = line.replace(/^data:\s*/, '').trim();
          processStreamData(dataStr);
        }
      }
      return;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      console.error(`[API Stream] 呼叫失敗 (第 ${attempt} 次):`, e);
      if (
        e.message &&
        (e.message.startsWith('HTTP 400') ||
          e.message.includes(
            'Function calling with streaming is not supported by this proxy',
          ) ||
          e.message.includes('Function calling is not enabled'))
      ) {
        throw e;
      }
      if (attempt >= maxRetries) throw e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('已達最大重試次數仍失敗');
}
