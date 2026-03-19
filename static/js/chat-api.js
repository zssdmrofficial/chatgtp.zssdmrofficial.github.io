async function stopGeneration() {
  if (abortController) {
    abortController.abort();
    abortController = null;
    isAwaitingResponse = false;
    updateSendButtonState();
    updateConversationLockUI();
  }
}

async function regenerateMessage(modelMessageIndex) {
  if (isAwaitingResponse) {
    await stopGeneration();
    return;
  }
  if (modelMessageIndex < 0 || modelMessageIndex >= history.length) return;
  const modelMsg = history[modelMessageIndex];
  if (!modelMsg || modelMsg.role !== 'model') return;

  let userMsgIndex = modelMessageIndex - 1;
  while (userMsgIndex >= 0) {
    const candidate = history[userMsgIndex];
    if (candidate.role === 'user') {
      if (candidate.isHidden) {
        userMsgIndex--;
        continue;
      }
      const msgText = candidate.parts?.[0]?.text || '';
      const isSystemGenerated = msgText.startsWith(
        '(System: Code execution result)',
      );
      if (!isSystemGenerated) break;
    }
    userMsgIndex--;
  }
  if (userMsgIndex < 0) return;

  const userMsg = history[userMsgIndex];
  const userText = userMsg.displayText || userMsg.parts?.[0]?.text || '';
  const composedText = userMsg.parts?.[0]?.text || '';

  const isFirstPair =
    userMsgIndex === 0 ||
    (userMsgIndex === 1 && history[0]?.parts?.[0]?.text === SYSTEM_INSTRUCTION);

  const firstModelAfterUser = userMsgIndex + 1;
  const messagesToRemove = history.slice(firstModelAfterUser);
  history = history.slice(0, firstModelAfterUser);
  renderHistory();

  const activeConvId = currentConversationId;

  const idsToDelete = messagesToRemove
    .map((msg) => msg?.messageId)
    .filter((id) => typeof id === 'string' && id.length > 0);
  if (idsToDelete.length && activeConvId) {
    await deleteMessagesByIds(activeConvId, idsToDelete);
  }

  isAwaitingResponse = true;
  abortController = new AbortController();
  updateSendButtonState();
  updateConversationLockUI();

  let loadingId = showLoading();

  try {
    let keepGoing = true;
    let loopCount = 0;
    let isAborted = false;

    while (keepGoing) {
      loopCount++;

      let finalSystemPrompt = SYSTEM_INSTRUCTION;
      if (isPythonEnabled) {
        finalSystemPrompt += '\n' + PYTHON_SYSTEM_PROMPT_ADDITION;
      }
      if (isSearchEnabled) {
        finalSystemPrompt += '\n' + SEARCH_SYSTEM_PROMPT_ADDITION;
      }

      let payloadHistory = [
        { role: 'user', parts: [{ text: finalSystemPrompt }] },
        ...history.map((msg) => {
          const sanitizedParts = msg.parts.map((p) => {
            if (p.thought) {
              return { text: `[Thinking]\n${p.thought}` };
            }
            if (p.functionCall) {
              return {
                text: `[模型嘗試執行代碼]:\n${p.functionCall.args?.code || '(無代碼)'}`,
              };
            }
            if (p.functionResponse) {
              return {
                text: `[執行結果回報]:\n${JSON.stringify(p.functionResponse.response?.content || {})}`,
              };
            }
            return p;
          });
          return {
            role: msg.role === 'function' ? 'user' : msg.role,
            parts: sanitizedParts,
          };
        }),
      ];

      const requestBody = { contents: payloadHistory };
      if (currentThinkingLevel) {
        requestBody.generationConfig = {
          thinkingConfig: {
            thinkingLevel: currentThinkingLevel,
            includeThoughts: true,
          },
        };
      }
      let currentResponseText = '';
      let currentThoughtText = '';
      let beforePythonText = '';
      let hasEncounteredPython = false;

      let streamMsgDiv = null;
      let textContentEl = null;
      let thoughtDetailsEl = null;

      try {
        await callApiStreamWithRetry(
          requestBody,
          (chunk) => {
            const textChunk = typeof chunk === 'string' ? chunk : chunk.text;
            const isThought = typeof chunk === 'object' && chunk.isThought;

            const el = document.getElementById(loadingId);
            if (el) el.remove();

            if (!streamMsgDiv) {
              streamMsgDiv = document.createElement('div');
              streamMsgDiv.className = 'message-wrapper';
              streamMsgDiv.dataset.role = 'model';
              streamMsgDiv.innerHTML = `
                            <div class="message-content">
                                <div class="role-icon icon-model">${MODEL_ROLE_ICON}</div>
                                <div class="text-content"></div>
                            </div>
                        `;
              textContentEl = streamMsgDiv.querySelector('.text-content');
              chatBoxEl.appendChild(streamMsgDiv);
            }

            if (isThought) {
              currentThoughtText += textChunk;
              let displayTitle = chunk.thoughtSummary || '';
              if (!displayTitle) {
                const matches = [
                  ...currentThoughtText.matchAll(/\*\*(.*?)\*\*/g),
                ];
                if (matches.length > 0) {
                  displayTitle = matches[matches.length - 1][1];
                }
              }

              if (!thoughtDetailsEl) {
                thoughtDetailsEl = document.createElement('details');
                thoughtDetailsEl.className = 'thinking-details';
                thoughtDetailsEl.innerHTML = `<summary>${THINKING_ICON}<span class="thinking-title">${displayTitle}</span>${CHEVRON_DOWN_ICON}</summary><div class="thinking-details-content"></div>`;
                textContentEl.insertBefore(
                  thoughtDetailsEl,
                  textContentEl.firstChild,
                );
              } else if (displayTitle) {
                const titleEl =
                  thoughtDetailsEl.querySelector('.thinking-title');
                if (titleEl && titleEl.textContent !== 'Show Thinking') {
                  titleEl.textContent = displayTitle;
                }
              }
              const thoughtContent = thoughtDetailsEl.querySelector(
                '.thinking-details-content',
              );
              if (thoughtContent) {
                thoughtContent.innerHTML = markdownToHtml(currentThoughtText);
              }
            } else {
              if (thoughtDetailsEl) {
                const titleEl =
                  thoughtDetailsEl.querySelector('.thinking-title');
                if (titleEl) titleEl.textContent = 'Show Thinking';
              }
              currentResponseText += textChunk;
              if (!hasEncounteredPython) {
                let markerIdx = currentResponseText.indexOf('\`\`\`execute');
                if (markerIdx !== -1) {
                  hasEncounteredPython = true;
                  beforePythonText = currentResponseText
                    .substring(0, markerIdx)
                    .trim();
                  let mainContent = textContentEl.querySelector(
                    '.thinking-main-response',
                  );
                  if (!mainContent) {
                    mainContent = document.createElement('div');
                    mainContent.className = 'thinking-main-response';
                    textContentEl.appendChild(mainContent);
                  }
                  mainContent.innerHTML = markdownToHtml(beforePythonText);
                } else {
                  let mainContent = textContentEl.querySelector(
                    '.thinking-main-response',
                  );
                  if (currentThoughtText && !mainContent) {
                    mainContent = document.createElement('div');
                    mainContent.className = 'thinking-main-response';
                    textContentEl.appendChild(mainContent);
                  }
                  if (mainContent) {
                    mainContent.innerHTML = markdownToHtml(currentResponseText);
                  } else {
                    textContentEl.innerHTML =
                      (thoughtDetailsEl ? thoughtDetailsEl.outerHTML : '') +
                      markdownToHtml(currentResponseText);
                    if (thoughtDetailsEl) {
                      thoughtDetailsEl =
                        textContentEl.querySelector('.thinking-details');
                    }
                  }
                }
              }
            }
            chatBoxEl.scrollTop = chatBoxEl.scrollHeight;
          },
          API_MAX_RETRY_LOOPS,
          abortController.signal,
        );
      } catch (streamErr) {
        if (streamErr.name === 'AbortError') {
          console.log('[API Stream] 串流已由使用者暫停');
          if (streamMsgDiv) streamMsgDiv.remove();
          if (!currentResponseText) {
            removeLoading(loadingId);
            return;
          }

          keepGoing = false;
          isAborted = true;
        } else {
          throw streamErr;
        }
      }

      if (streamMsgDiv) streamMsgDiv.remove();
      const responseText = currentResponseText;
      const thoughtText = currentThoughtText;
      const pythonMatch = isPythonEnabled
        ? responseText.match(PYTHON_BLOCK_REGEX)
        : null;
      const searchMatch = isSearchEnabled
        ? responseText.match(SEARCH_BLOCK_REGEX)
        : null;
      const browseMatch = isSearchEnabled
        ? responseText.match(BROWSE_BLOCK_REGEX)
        : null;

      const isValidPython = keepGoing && pythonMatch && pythonExecutorInstance;
      const isValidSearch = keepGoing && searchMatch;
      const isValidBrowse = keepGoing && browseMatch && !isValidSearch;

      let thoughtHtml = '';
      if (thoughtText) {
        thoughtHtml = `<details class="thinking-details"><summary>${THINKING_ICON}<span>Show Thinking</span>${CHEVRON_DOWN_ICON}</summary><div class="thinking-details-content">${markdownToHtml(thoughtText)}</div></details>`;
      }

      if (
        hasEncounteredPython &&
        (isValidPython || isValidSearch || isValidBrowse)
      ) {
        if (beforePythonText) {
          const beforeParts = thoughtText
            ? [
                { text: `[Thinking]\n${thoughtText}` },
                { text: beforePythonText },
              ]
            : [{ text: beforePythonText }];
          const beforeDisplay = thoughtHtml + markdownToHtml(beforePythonText);
          const textBeforeMsg = {
            role: 'model',
            parts: beforeParts,
            displayText: beforeDisplay,
            isHtml: true,
          };
          history.push(textBeforeMsg);
          renderMessage(
            'model',
            beforePythonText,
            false,
            beforeDisplay,
            history.length - 1,
            true,
            false,
            true,
          );

          if (currentUser && activeConvId) {
            const combinedContent = thoughtText
              ? `[Thinking]\n${thoughtText}\n\n${beforePythonText}`
              : beforePythonText;
            const beforeMsgId = await addMessage(
              activeConvId,
              'model',
              combinedContent,
              beforeDisplay,
              true,
            );
            textBeforeMsg.messageId = beforeMsgId;
            if (isFirstPair && !isAborted) {
              await generateAndSetConversationTitle(
                activeConvId,
                userText,
                beforePythonText,
              );
            }
          }
        }
      }

      if (isValidPython) {
        const code = pythonMatch[1];
        const indicatorId = `py-exec-${Date.now()}`;
        const escapedCode = escapeHtml(code);
        const pythonAnalysisHtml = `
                    <div class="python-analysis-indicator" id="${indicatorId}">
                        <div class="python-analysis-header" onclick="if(!event.target.closest('.copy-button')){this.parentElement.classList.toggle('expanded');scheduleBubbleShapeRefresh();}">
                            <div class="status-text">
                                ${PYTHON_ICON}
                                <span>模型正在使用 Python 分析</span>
                            </div>
                            <div class="python-analysis-actions">
                                <button type="button" class="copy-button" aria-label="複製程式碼">
                                    <span class="copy-btn-icon copy-btn-icon-default">${CODE_BLOCK_COPY_ICON}</span>
                                    <span class="copy-btn-icon copy-btn-icon-success">${CODE_BLOCK_COPY_SUCCESS_ICON}</span>
                                </button>
                                <div class="status-icon">
                                    ${CHEVRON_DOWN_ICON}
                                </div>
                            </div>
                        </div>
                        <div class="python-analysis-code">
                            <div class="code-container">
                                <div class="code-header">
                                    <span>python</span>
                                    <button type="button" class="copy-button" aria-label="複製程式碼">
                                        <span class="copy-btn-icon copy-btn-icon-default">${CODE_BLOCK_COPY_ICON}</span>
                                        <span class="copy-btn-icon copy-btn-icon-success">${CODE_BLOCK_COPY_SUCCESS_ICON}</span>
                                    </button>
                                </div>
                                <pre><code>${escapedCode}</code></pre>
                            </div>
                        </div>
                    </div>
                `;

        const pyParts = thoughtText
          ? [{ text: `[Thinking]\n${thoughtText}` }, { text: responseText }]
          : [{ text: responseText }];
        let pyDisplay = pythonAnalysisHtml;
        if (!beforePythonText && thoughtHtml) {
          pyDisplay = thoughtHtml + pyDisplay;
        }

        const newModelMsg = {
          role: 'model',
          parts: pyParts,
          displayText: pyDisplay,
          isHtml: true,
        };
        history.push(newModelMsg);
        renderMessage(
          'model',
          responseText,
          false,
          pyDisplay,
          history.length - 1,
          true,
          true,
        );

        if (currentUser && activeConvId) {
          const pyCombinedContent = thoughtText
            ? `[Thinking]\n${thoughtText}\n\n${responseText}`
            : responseText;
          const msgId = await addMessage(
            activeConvId,
            'model',
            pyCombinedContent,
            pyDisplay,
            true,
          );
          newModelMsg.messageId = msgId;
        }

        let resultLogs = '';
        let resultImages = [];
        let resultFiles = [];
        const execLoadingId = showLoading();

        try {
          const execResult = await pythonExecutorInstance.execute(
            code,
            activeConvId,
          );
          resultLogs = execResult.logs || 'No text output.';
          resultImages = execResult.images || [];
          resultFiles = execResult.files || [];
        } catch (err) {
          resultLogs = `Execution Error: ${err.message}`;
        } finally {
          removeLoading(execLoadingId);
        }

        let outputDisplay = `**Python 執行結果:**\n\`\`\`\n${resultLogs}\n\`\`\``;
        let textForModel = `**Python 執行結果:**\n\`\`\`\n${resultLogs}\n\`\`\``;
        let fileSummary = '';

        if (resultImages.length > 0) {
          fileSummary +=
            `\n\n**產生的圖片:**\n` +
            resultImages
              .map(
                (img) =>
                  `- ${img.name || 'plot.png'} (${formatBytes(getBase64Size(img.data))})`,
              )
              .join('\n');
          const imgTags = resultImages
            .map(
              (img) =>
                `<img src="data:${img.type};base64,${img.data}" alt="Plot">`,
            )
            .join('');
          outputDisplay += `\n\n<div class="image-gallery">${imgTags}</div>`;
        }
        if (resultFiles.length > 0) {
          fileSummary +=
            `\n\n**產生的檔案:**\n` +
            resultFiles
              .map(
                (file) =>
                  `- ${file.name} (${formatBytes(getBase64Size(file.data))})`,
              )
              .join('\n');
          const fileHtml = resultFiles
            .map(
              (file) =>
                `<div style="margin-top:8px;"><a href="data:${file.type};base64,${file.data}" download="${file.name}" style="text-decoration:none; color:var(--accent-strong); display:inline-flex; align-items:center; gap:6px; padding:10px 14px; border:1px solid var(--accent-strong); border-radius:8px; transition:all 0.2s; background:rgba(255,255,255,0.02);">${DOWNLOAD_FILE_ICON} 下載檔案：${file.name}</a></div>`,
            )
            .join('');
          outputDisplay += `\n\n**產生的檔案:**\n${fileHtml}`;
        }

        if (fileSummary) {
          textForModel += fileSummary;
        }

        const userFeedbackMsg = {
          role: 'user',
          parts: [
            {
              text: `(System: Code execution result)\n${textForModel}\n請根據以上執行結果回答使用者的問題。`,
            },
          ],
          displayText: outputDisplay,
          messageId: null,
        };
        history.push(userFeedbackMsg);
        renderMessage(
          'model',
          '',
          false,
          outputDisplay,
          history.length - 1,
          false,
          true,
          false,
          true,
        );

        if (currentUser && activeConvId) {
          const resultMsgId = await addMessage(
            activeConvId,
            'model',
            '',
            outputDisplay,
            false,
          );
          userFeedbackMsg.messageId = resultMsgId;
        }

        loadingId = showLoading();
        continue;
      } else if (isValidSearch) {
        const query = searchMatch[1].trim();

        const indicatorId = `search-exec-${Date.now()}`;
        const escapedQuery = escapeHtml(query);
        const searchIndicatorHtml = `
                    <div class="python-analysis-indicator" id="${indicatorId}">
                        <div class="python-analysis-header" onclick="if(!event.target.closest('.copy-button')){this.parentElement.classList.toggle('expanded');scheduleBubbleShapeRefresh();}">
                            <div class="status-text">
                                ${SEARCH_TOOL_ICON}
                                <span>模型正在搜尋</span>
                            </div>
                            <div class="python-analysis-actions">
                                <div class="status-icon">
                                    ${CHEVRON_DOWN_ICON}
                                </div>
                            </div>
                        </div>
                        <div class="python-analysis-code">
                            <div class="code-container">
                                <div class="code-header">
                                    <span>search query</span>
                                </div>
                                <pre><code>${escapedQuery}</code></pre>
                            </div>
                        </div>
                    </div>
                `;

        const pyParts = thoughtText
          ? [{ text: `[Thinking]\n${thoughtText}` }, { text: responseText }]
          : [{ text: responseText }];
        let pyDisplay = searchIndicatorHtml;
        if (!beforePythonText && thoughtHtml) {
          pyDisplay = thoughtHtml + pyDisplay;
        }

        const newModelMsg = {
          role: 'model',
          parts: pyParts,
          displayText: pyDisplay,
          isHtml: true,
        };
        history.push(newModelMsg);
        renderMessage(
          'model',
          responseText,
          false,
          pyDisplay,
          history.length - 1,
          true,
          true,
        );

        if (currentUser && activeConvId) {
          const pyCombinedContent = thoughtText
            ? `[Thinking]\n${thoughtText}\n\n${responseText}`
            : responseText;
          const msgId = await addMessage(
            activeConvId,
            'model',
            pyCombinedContent,
            pyDisplay,
            true,
          );
          newModelMsg.messageId = msgId;
        }

        let searchContext = '';
        const execLoadingId = showLoading();
        try {
          searchContext = await buildSearchContextPayload(query);
          if (!searchContext) searchContext = '搜尋無結果。';
        } catch (err) {
          searchContext = `搜尋失敗: ${err.message}`;
        } finally {
          removeLoading(execLoadingId);
        }

        let textForModel = searchContext;

        const userFeedbackMsg = {
          role: 'user',
          parts: [{ text: textForModel }],
          displayText: '',
          messageId: null,
          isHidden: true,
        };
        history.push(userFeedbackMsg);

        loadingId = showLoading();
        continue;
      } else if (isValidBrowse) {
        const browseUrl = browseMatch[1].trim();

        const indicatorId = `browse-exec-${Date.now()}`;
        const escapedUrl = escapeHtml(browseUrl);
        const browseIndicatorHtml = `
                    <div class="python-analysis-indicator" id="${indicatorId}">
                        <div class="python-analysis-header" onclick="if(!event.target.closest('.copy-button')){this.parentElement.classList.toggle('expanded');scheduleBubbleShapeRefresh();}">
                            <div class="status-text">
                                ${BROWSE_TOOL_ICON}
                                <span>模型正在瀏覽網頁</span>
                            </div>
                            <div class="python-analysis-actions">
                                <div class="status-icon">
                                    ${CHEVRON_DOWN_ICON}
                                </div>
                            </div>
                        </div>
                        <div class="python-analysis-code">
                            <div class="code-container">
                                <div class="code-header">
                                    <span>browse url</span>
                                </div>
                                <pre><code>${escapedUrl}</code></pre>
                            </div>
                        </div>
                    </div>
                `;

        const bParts = thoughtText
          ? [{ text: `[Thinking]\n${thoughtText}` }, { text: responseText }]
          : [{ text: responseText }];
        let bDisplay = browseIndicatorHtml;
        if (!beforePythonText && thoughtHtml) {
          bDisplay = thoughtHtml + bDisplay;
        }

        const newModelMsg = {
          role: 'model',
          parts: bParts,
          displayText: bDisplay,
          isHtml: true,
        };
        history.push(newModelMsg);
        renderMessage(
          'model',
          responseText,
          false,
          bDisplay,
          history.length - 1,
          true,
          true,
        );

        if (currentUser && activeConvId) {
          const bCombinedContent = thoughtText
            ? `[Thinking]\n${thoughtText}\n\n${responseText}`
            : responseText;
          const msgId = await addMessage(
            activeConvId,
            'model',
            bCombinedContent,
            bDisplay,
            true,
          );
          newModelMsg.messageId = msgId;
        }

        let browseContext = '';
        const execLoadingId = showLoading();
        try {
          browseContext = await buildBrowseContextPayload(browseUrl);
          if (!browseContext) browseContext = '無法讀取該網頁內容。';
        } catch (err) {
          browseContext = `網頁讀取失敗: ${err.message}`;
        } finally {
          removeLoading(execLoadingId);
        }

        const userFeedbackMsg = {
          role: 'user',
          parts: [{ text: browseContext }],
          displayText: '',
          messageId: null,
          isHidden: true,
        };
        history.push(userFeedbackMsg);

        loadingId = showLoading();
        continue;
      } else {
        const finalParts = thoughtText
          ? [{ text: `[Thinking]\n${thoughtText}` }, { text: responseText }]
          : [{ text: responseText }];
        const finalDisplay = thoughtHtml + markdownToHtml(responseText);
        const finalCombinedContent = thoughtText
          ? `[Thinking]\n${thoughtText}\n\n${responseText}`
          : responseText;
        const newModelMsg = {
          role: 'model',
          parts: finalParts,
          displayText: finalDisplay,
          isHtml: true,
        };
        history.push(newModelMsg);
        removeLoading(loadingId);
        renderMessage(
          'model',
          responseText,
          false,
          finalDisplay,
          history.length - 1,
          true,
          false,
        );

        if (currentUser && activeConvId) {
          const msgId = await addMessage(
            activeConvId,
            'model',
            finalCombinedContent,
            finalDisplay,
            true,
          );
          newModelMsg.messageId = msgId;

          if (isFirstPair && !isAborted) {
            await generateAndSetConversationTitle(
              activeConvId,
              userText,
              responseText,
            );
          }

          await loadConversations(currentUser.uid);
        }
        keepGoing = false;
      }
    }
  } catch (e) {
    removeLoading(loadingId);
    if (currentConversationId === activeConvId) {
      renderMessage('model', `Error: ${e.message}`, true);
    }
    console.error(e);
  } finally {
    removeLoading(loadingId);
    isAwaitingResponse = false;
    updateSendButtonState();
    updateConversationLockUI();
    if (window.innerWidth > 768 && currentConversationId === activeConvId) {
      inputEl.focus();
    }
  }
}

async function sendMessage() {
  if (isAwaitingResponse) {
    await stopGeneration();
    return;
  }

  const text = inputEl.value.trim();
  if (!text) return;

  const isFirstMessageTurn = history.length === 0;

  const toolContext = buildToolContextPayload();
  let composedText = toolContext
    ? `【工具資訊】\n${toolContext}\n\n【使用者提問】\n${text}`
    : text;

  if (isSearchEnabled && forceSearchNextTurn) {
    composedText +=
      '\n\n【系統強制指令】：使用者已啟用「強制檢索」模式，要求你必須透過網路取得資訊後再回答，請勿未經檢索直接回答。請根據使用者的訊息內容判斷任務類型，選擇最合適的工具：\n- 若使用者的問題需要查詢最新資訊、時事、或進行關鍵字搜尋，請輸出 `execute-search` 程式碼區塊。\n- 若使用者提供了一個明確的網址(URL)要求你閱讀其內容，請輸出 `execute-browse` 程式碼區塊。\n此外，請將這次檢索視為探索一個「全新的事物」，完全拋棄任何既有的偏見、主觀意識或背景知識，僅基於檢索到的客觀事實進行理解與回答。';
    forceSearchNextTurn = false;
    if (typeof renderPromptTools === 'function') renderPromptTools();
  }

  if (currentUser && !currentConversationId && !isTempChatMode) {
    const newId = await createConversation(DEFAULT_CHAT_TITLE);
    if (!newId) return;
  }

  const activeConvId = currentConversationId;

  if (isEditingMessage) {
    setEditingState(false);
  }

  isAwaitingResponse = true;
  abortController = new AbortController();
  inputEl.value = '';
  inputEl.style.height = 'auto';
  updateSendButtonState();
  updateConversationLockUI();

  const userMsg = {
    role: 'user',
    parts: [{ text: composedText }],
    displayText: text,
    messageId: null,
  };
  history.push(userMsg);
  renderMessage('user', composedText, false, text, history.length - 1);

  let loadingId = showLoading();

  try {
    if (currentUser && activeConvId) {
      const userMsgId = await addMessage(
        activeConvId,
        'user',
        composedText,
        text,
        false,
      );
      userMsg.messageId = userMsgId;
      await updateConversationTitleIfEmpty(activeConvId, text);
    }
    let keepGoing = true;
    let loopCount = 0;
    let isAborted = false;

    while (keepGoing) {
      loopCount++;

      let finalSystemPrompt = SYSTEM_INSTRUCTION;
      if (isPythonEnabled) {
        finalSystemPrompt += '\n' + PYTHON_SYSTEM_PROMPT_ADDITION;
      }
      if (isSearchEnabled) {
        finalSystemPrompt += '\n' + SEARCH_SYSTEM_PROMPT_ADDITION;
      }

      let payloadHistory = [
        { role: 'user', parts: [{ text: finalSystemPrompt }] },
        ...history.map((msg) => {
          const sanitizedParts = msg.parts.map((p) => {
            if (p.functionCall) {
              return {
                text: `[模型嘗試執行代碼]:\n${p.functionCall.args?.code || '(無代碼)'}`,
              };
            }
            if (p.functionResponse) {
              return {
                text: `[執行結果回報]:\n${JSON.stringify(p.functionResponse.response?.content || {})}`,
              };
            }
            return p;
          });

          return {
            role: msg.role === 'function' ? 'user' : msg.role,
            parts: sanitizedParts,
          };
        }),
      ];

      const requestBody = { contents: payloadHistory };
      if (currentThinkingLevel) {
        requestBody.generationConfig = {
          thinkingConfig: {
            thinkingLevel: currentThinkingLevel,
            includeThoughts: true,
          },
        };
      }
      let currentResponseText = '';
      let currentThoughtText = '';
      let beforePythonText = '';
      let hasEncounteredPython = false;

      let streamMsgDiv = null;
      let textContentEl = null;
      let thoughtDetailsEl = null;

      try {
        await callApiStreamWithRetry(
          requestBody,
          (chunk) => {
            const textChunk = typeof chunk === 'string' ? chunk : chunk.text;
            const isThought = typeof chunk === 'object' && chunk.isThought;

            const el = document.getElementById(loadingId);
            if (el) el.remove();

            if (!streamMsgDiv) {
              streamMsgDiv = document.createElement('div');
              streamMsgDiv.className = 'message-wrapper';
              streamMsgDiv.dataset.role = 'model';
              streamMsgDiv.innerHTML = `
                            <div class="message-content">
                                <div class="role-icon icon-model">${MODEL_ROLE_ICON}</div>
                                <div class="text-content"></div>
                            </div>
                        `;
              textContentEl = streamMsgDiv.querySelector('.text-content');
              chatBoxEl.appendChild(streamMsgDiv);
            }

            if (isThought) {
              currentThoughtText += textChunk;

              let displayTitle = chunk.thoughtSummary || '';
              if (!displayTitle) {
                const matches = [
                  ...currentThoughtText.matchAll(/\*\*(.*?)\*\*/g),
                ];
                if (matches.length > 0) {
                  displayTitle = matches[matches.length - 1][1];
                }
              }

              if (!thoughtDetailsEl) {
                thoughtDetailsEl = document.createElement('details');
                thoughtDetailsEl.className = 'thinking-details';
                thoughtDetailsEl.innerHTML = `<summary>${THINKING_ICON}<span class="thinking-title">${displayTitle}</span>${CHEVRON_DOWN_ICON}</summary><div class="thinking-details-content"></div>`;
                textContentEl.insertBefore(
                  thoughtDetailsEl,
                  textContentEl.firstChild,
                );
              } else if (displayTitle) {
                const titleEl =
                  thoughtDetailsEl.querySelector('.thinking-title');
                if (titleEl && titleEl.textContent !== 'Show Thinking') {
                  titleEl.textContent = displayTitle;
                }
              }
              const thoughtContent = thoughtDetailsEl.querySelector(
                '.thinking-details-content',
              );
              if (thoughtContent) {
                thoughtContent.innerHTML = markdownToHtml(currentThoughtText);
              }
            } else {
              if (thoughtDetailsEl) {
                const titleEl =
                  thoughtDetailsEl.querySelector('.thinking-title');
                if (titleEl) titleEl.textContent = 'Show Thinking';
              }
              currentResponseText += textChunk;
              if (!hasEncounteredPython) {
                let markerIdx = currentResponseText.indexOf('\`\`\`execute');
                if (markerIdx !== -1) {
                  hasEncounteredPython = true;
                  beforePythonText = currentResponseText
                    .substring(0, markerIdx)
                    .trim();
                  let mainContent = textContentEl.querySelector(
                    '.thinking-main-response',
                  );
                  if (!mainContent) {
                    mainContent = document.createElement('div');
                    mainContent.className = 'thinking-main-response';
                    textContentEl.appendChild(mainContent);
                  }
                  mainContent.innerHTML = markdownToHtml(beforePythonText);
                } else {
                  let mainContent = textContentEl.querySelector(
                    '.thinking-main-response',
                  );
                  if (currentThoughtText && !mainContent) {
                    mainContent = document.createElement('div');
                    mainContent.className = 'thinking-main-response';
                    textContentEl.appendChild(mainContent);
                  }
                  if (mainContent) {
                    mainContent.innerHTML = markdownToHtml(currentResponseText);
                  } else {
                    textContentEl.innerHTML =
                      (thoughtDetailsEl ? thoughtDetailsEl.outerHTML : '') +
                      markdownToHtml(currentResponseText);
                    if (thoughtDetailsEl) {
                      thoughtDetailsEl =
                        textContentEl.querySelector('.thinking-details');
                    }
                  }
                }
              }
            }
            chatBoxEl.scrollTop = chatBoxEl.scrollHeight;
          },
          API_MAX_RETRY_LOOPS,
          abortController.signal,
        );
      } catch (streamErr) {
        if (streamErr.name === 'AbortError') {
          console.log('[API Stream] 串流已由使用者暫停');
          if (streamMsgDiv) streamMsgDiv.remove();
          if (!currentResponseText) {
            removeLoading(loadingId);
            return;
          }

          keepGoing = false;
          isAborted = true;
        } else {
          throw streamErr;
        }
      }

      if (streamMsgDiv) streamMsgDiv.remove();
      const responseText = currentResponseText;
      const thoughtText = currentThoughtText;
      const pythonMatch = isPythonEnabled
        ? responseText.match(PYTHON_BLOCK_REGEX)
        : null;
      const searchMatch = isSearchEnabled
        ? responseText.match(SEARCH_BLOCK_REGEX)
        : null;
      const browseMatch = isSearchEnabled
        ? responseText.match(BROWSE_BLOCK_REGEX)
        : null;

      const isValidPython = keepGoing && pythonMatch && pythonExecutorInstance;
      const isValidSearch = keepGoing && searchMatch;
      const isValidBrowse = keepGoing && browseMatch && !isValidSearch;

      let thoughtHtml = '';
      if (thoughtText) {
        thoughtHtml = `<details class="thinking-details"><summary>${THINKING_ICON}<span>Show Thinking</span>${CHEVRON_DOWN_ICON}</summary><div class="thinking-details-content">${markdownToHtml(thoughtText)}</div></details>`;
      }

      if (
        hasEncounteredPython &&
        (isValidPython || isValidSearch || isValidBrowse)
      ) {
        if (beforePythonText) {
          const beforeParts = thoughtText
            ? [
                { text: `[Thinking]\n${thoughtText}` },
                { text: beforePythonText },
              ]
            : [{ text: beforePythonText }];
          const beforeDisplay = thoughtHtml + markdownToHtml(beforePythonText);
          const textBeforeMsg = {
            role: 'model',
            parts: beforeParts,
            displayText: beforeDisplay,
            isHtml: true,
          };
          history.push(textBeforeMsg);
          renderMessage(
            'model',
            beforePythonText,
            false,
            beforeDisplay,
            history.length - 1,
            true,
            false,
            true,
          );

          if (currentUser && activeConvId) {
            const combinedContent = thoughtText
              ? `[Thinking]\n${thoughtText}\n\n${beforePythonText}`
              : beforePythonText;
            const beforeMsgId = await addMessage(
              activeConvId,
              'model',
              combinedContent,
              beforeDisplay,
              true,
            );
            textBeforeMsg.messageId = beforeMsgId;
            if (isFirstMessageTurn && !isAborted) {
              await generateAndSetConversationTitle(
                activeConvId,
                text,
                beforePythonText,
              );
            }
          }
        }
      }

      if (isValidPython) {
        const code = pythonMatch[1];

        const indicatorId = `py-exec-${Date.now()}`;
        const escapedCode = escapeHtml(code);
        const pythonAnalysisHtml = `
                    <div class="python-analysis-indicator" id="${indicatorId}">
                        <div class="python-analysis-header" onclick="if(!event.target.closest('.copy-button')){this.parentElement.classList.toggle('expanded');scheduleBubbleShapeRefresh();}">
                            <div class="status-text">
                                ${PYTHON_ICON}
                                <span>模型正在使用 Python 分析</span>
                            </div>
                            <div class="python-analysis-actions">
                                <button type="button" class="copy-button" aria-label="複製程式碼">
                                    <span class="copy-btn-icon copy-btn-icon-default">${CODE_BLOCK_COPY_ICON}</span>
                                    <span class="copy-btn-icon copy-btn-icon-success">${CODE_BLOCK_COPY_SUCCESS_ICON}</span>
                                </button>
                                <div class="status-icon">
                                    ${CHEVRON_DOWN_ICON}
                                </div>
                            </div>
                        </div>
                        <div class="python-analysis-code">
                            <div class="code-container">
                                <div class="code-header">
                                    <span>python</span>
                                    <button type="button" class="copy-button" aria-label="複製程式碼">
                                        <span class="copy-btn-icon copy-btn-icon-default">${CODE_BLOCK_COPY_ICON}</span>
                                        <span class="copy-btn-icon copy-btn-icon-success">${CODE_BLOCK_COPY_SUCCESS_ICON}</span>
                                    </button>
                                </div>
                                <pre><code>${escapedCode}</code></pre>
                            </div>
                        </div>
                    </div>
                `;

        const pyParts = thoughtText
          ? [{ text: `[Thinking]\n${thoughtText}` }, { text: responseText }]
          : [{ text: responseText }];
        let pyDisplay = pythonAnalysisHtml;
        if (!beforePythonText && thoughtHtml) {
          pyDisplay = thoughtHtml + pyDisplay;
        }

        const modelMsg = {
          role: 'model',
          parts: pyParts,
          displayText: pyDisplay,
          isHtml: true,
        };
        history.push(modelMsg);
        renderMessage(
          'model',
          responseText,
          false,
          pyDisplay,
          history.length - 1,
          true,
          true,
        );

        if (currentUser && activeConvId) {
          const pyCombinedContent = thoughtText
            ? `[Thinking]\n${thoughtText}\n\n${responseText}`
            : responseText;
          const pyMsgId = await addMessage(
            activeConvId,
            'model',
            pyCombinedContent,
            pyDisplay,
            true,
          );
          modelMsg.messageId = pyMsgId;
        }

        let resultLogs = '';
        let resultImages = [];
        let resultFiles = [];
        const execLoadingId = showLoading();

        try {
          const execResult = await pythonExecutorInstance.execute(
            code,
            activeConvId,
          );
          resultLogs = execResult.logs || 'No text output.';
          resultImages = execResult.images || [];
          resultFiles = execResult.files || [];
        } catch (err) {
          resultLogs = `Execution Error: ${err.message}`;
        } finally {
          removeLoading(execLoadingId);
        }

        let outputDisplay = `**Python 執行結果:**\n\`\`\`\n${resultLogs}\n\`\`\``;
        let textForModel = `**Python 執行結果:**\n\`\`\`\n${resultLogs}\n\`\`\``;
        let fileSummary = '';

        if (resultImages.length > 0) {
          fileSummary +=
            `\n\n**產生的圖片:**\n` +
            resultImages
              .map(
                (img) =>
                  `- ${img.name || 'plot.png'} (${formatBytes(getBase64Size(img.data))})`,
              )
              .join('\n');
          const imgTags = resultImages
            .map(
              (img) =>
                `<img src="data:${img.type};base64,${img.data}" alt="Plot">`,
            )
            .join('');
          outputDisplay += `\n\n<div class="image-gallery">${imgTags}</div>`;
        }

        if (resultFiles.length > 0) {
          fileSummary +=
            `\n\n**產生的檔案:**\n` +
            resultFiles
              .map(
                (file) =>
                  `- ${file.name} (${formatBytes(getBase64Size(file.data))})`,
              )
              .join('\n');
          const fileHtml = resultFiles
            .map(
              (file) =>
                `<div style="margin-top:8px;"><a href="data:${file.type};base64,${file.data}" download="${file.name}" style="text-decoration:none; color:var(--accent-strong); display:inline-flex; align-items:center; gap:6px; padding:10px 14px; border:1px solid var(--accent-strong); border-radius:8px; transition:all 0.2s; background:rgba(255,255,255,0.02);">${DOWNLOAD_FILE_ICON}${file.name}</a></div>`,
            )
            .join('');
          outputDisplay += `\n\n**產生的檔案:**\n${fileHtml}`;
        }

        if (fileSummary) {
          textForModel += fileSummary;
        }

        const userFeedbackMsg = {
          role: 'user',
          parts: [
            {
              text: `(System: Code execution result)\n${textForModel}\n請根據以上執行結果回答使用者的問題。`,
            },
          ],
          displayText: outputDisplay,
          messageId: null,
        };

        history.push(userFeedbackMsg);
        renderMessage(
          'model',
          '',
          false,
          outputDisplay,
          history.length - 1,
          false,
          true,
          false,
          true,
        );

        if (currentUser && activeConvId) {
          const resultMsgId = await addMessage(
            activeConvId,
            'model',
            '',
            outputDisplay,
            false,
          );
          userFeedbackMsg.messageId = resultMsgId;
        }

        loadingId = showLoading();
        continue;
      } else if (isValidSearch) {
        const query = searchMatch[1].trim();

        const indicatorId = `search-exec-${Date.now()}`;
        const escapedQuery = escapeHtml(query);
        const searchIndicatorHtml = `
                    <div class="python-analysis-indicator" id="${indicatorId}">
                        <div class="python-analysis-header" onclick="if(!event.target.closest('.copy-button')){this.parentElement.classList.toggle('expanded');scheduleBubbleShapeRefresh();}">
                            <div class="status-text">
                                ${SEARCH_TOOL_ICON}
                                <span>模型正在搜尋</span>
                            </div>
                            <div class="python-analysis-actions">
                                <div class="status-icon">
                                    ${CHEVRON_DOWN_ICON}
                                </div>
                            </div>
                        </div>
                        <div class="python-analysis-code">
                            <div class="code-container">
                                <div class="code-header">
                                    <span>search query</span>
                                </div>
                                <pre><code>${escapedQuery}</code></pre>
                            </div>
                        </div>
                    </div>
                `;

        const pyParts = thoughtText
          ? [{ text: `[Thinking]\n${thoughtText}` }, { text: responseText }]
          : [{ text: responseText }];
        let pyDisplay = searchIndicatorHtml;
        if (!beforePythonText && thoughtHtml) {
          pyDisplay = thoughtHtml + pyDisplay;
        }

        const newModelMsg = {
          role: 'model',
          parts: pyParts,
          displayText: pyDisplay,
          isHtml: true,
        };
        history.push(newModelMsg);
        renderMessage(
          'model',
          responseText,
          false,
          pyDisplay,
          history.length - 1,
          true,
          true,
        );

        if (currentUser && activeConvId) {
          const pyCombinedContent = thoughtText
            ? `[Thinking]\n${thoughtText}\n\n${responseText}`
            : responseText;
          const msgId = await addMessage(
            activeConvId,
            'model',
            pyCombinedContent,
            pyDisplay,
            true,
          );
          newModelMsg.messageId = msgId;
        }

        let searchContext = '';
        const execLoadingId = showLoading();
        try {
          searchContext = await buildSearchContextPayload(query);
          if (!searchContext) searchContext = '搜尋無結果。';
        } catch (err) {
          searchContext = `搜尋失敗: ${err.message}`;
        } finally {
          removeLoading(execLoadingId);
        }

        let textForModel = searchContext;

        const userFeedbackMsg = {
          role: 'user',
          parts: [{ text: textForModel }],
          displayText: '',
          messageId: null,
          isHidden: true,
        };
        history.push(userFeedbackMsg);

        loadingId = showLoading();
        continue;
      } else if (isValidBrowse) {
        const browseUrl = browseMatch[1].trim();

        const indicatorId = `browse-exec-${Date.now()}`;
        const escapedUrl = escapeHtml(browseUrl);
        const browseIndicatorHtml = `
                    <div class="python-analysis-indicator" id="${indicatorId}">
                        <div class="python-analysis-header" onclick="if(!event.target.closest('.copy-button')){this.parentElement.classList.toggle('expanded');scheduleBubbleShapeRefresh();}">
                            <div class="status-text">
                                ${BROWSE_TOOL_ICON}
                                <span>模型正在瀏覽網頁</span>
                            </div>
                            <div class="python-analysis-actions">
                                <div class="status-icon">
                                    ${CHEVRON_DOWN_ICON}
                                </div>
                            </div>
                        </div>
                        <div class="python-analysis-code">
                            <div class="code-container">
                                <div class="code-header">
                                    <span>browse url</span>
                                </div>
                                <pre><code>${escapedUrl}</code></pre>
                            </div>
                        </div>
                    </div>
                `;

        const bParts = thoughtText
          ? [{ text: `[Thinking]\n${thoughtText}` }, { text: responseText }]
          : [{ text: responseText }];
        let bDisplay = browseIndicatorHtml;
        if (!beforePythonText && thoughtHtml) {
          bDisplay = thoughtHtml + bDisplay;
        }

        const newModelMsg = {
          role: 'model',
          parts: bParts,
          displayText: bDisplay,
          isHtml: true,
        };
        history.push(newModelMsg);
        renderMessage(
          'model',
          responseText,
          false,
          bDisplay,
          history.length - 1,
          true,
          true,
        );

        if (currentUser && activeConvId) {
          const bCombinedContent = thoughtText
            ? `[Thinking]\n${thoughtText}\n\n${responseText}`
            : responseText;
          const msgId = await addMessage(
            activeConvId,
            'model',
            bCombinedContent,
            bDisplay,
            true,
          );
          newModelMsg.messageId = msgId;
        }

        let browseContext = '';
        const execLoadingId = showLoading();
        try {
          browseContext = await buildBrowseContextPayload(browseUrl);
          if (!browseContext) browseContext = '無法讀取該網頁內容。';
        } catch (err) {
          browseContext = `網頁讀取失敗: ${err.message}`;
        } finally {
          removeLoading(execLoadingId);
        }

        const userFeedbackMsg = {
          role: 'user',
          parts: [{ text: browseContext }],
          displayText: '',
          messageId: null,
          isHidden: true,
        };
        history.push(userFeedbackMsg);

        loadingId = showLoading();
        continue;
      } else {
        const finalParts = thoughtText
          ? [{ text: `[Thinking]\n${thoughtText}` }, { text: responseText }]
          : [{ text: responseText }];
        const finalDisplay = thoughtHtml + markdownToHtml(responseText);
        const finalCombinedContent = thoughtText
          ? `[Thinking]\n${thoughtText}\n\n${responseText}`
          : responseText;
        const modelMsg = {
          role: 'model',
          parts: finalParts,
          displayText: finalDisplay,
          isHtml: true,
        };
        history.push(modelMsg);
        removeLoading(loadingId);
        renderMessage(
          'model',
          responseText,
          false,
          finalDisplay,
          history.length - 1,
          true,
          false,
        );

        if (currentUser && activeConvId) {
          const msgId = await addMessage(
            activeConvId,
            'model',
            finalCombinedContent,
            finalDisplay,
            true,
          );
          modelMsg.messageId = msgId;

          if (isFirstMessageTurn && !isAborted) {
            await generateAndSetConversationTitle(
              activeConvId,
              text,
              responseText,
            );
          }

          await loadConversations(currentUser.uid);
        }
        keepGoing = false;
      }
    }
  } catch (e) {
    removeLoading(loadingId);
    if (currentConversationId === activeConvId) {
      renderMessage('model', `Error: ${e.message}`, true);
    }
    console.error(e);
  } finally {
    removeLoading(loadingId);
    isAwaitingResponse = false;
    updateSendButtonState();
    updateConversationLockUI();
    if (window.innerWidth > 768 && currentConversationId === activeConvId) {
      inputEl.focus();
    }
  }
}
