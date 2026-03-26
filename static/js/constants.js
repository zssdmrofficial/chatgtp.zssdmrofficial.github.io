const API_URL = 'https://gemini-api.zssdmr.dpdns.org/';
const PYTHON_API_URL = 'https://zssdmr-python.hf.space/';
const SEARXNG_PROXY_URL = 'https://searxng-proxy.zssdmr.dpdns.org/';
const BROWSE_PROXY_URL = 'https://browse-proxy.zssdmr.dpdns.org/';

const GEMINI_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
];

const PYTHON_SYSTEM_PROMPT_ADDITION = `
【能力擴充通知】
你現在擁有一個遠端 Python 執行環境 (基於 Flask/Hugging Face Space API)。
這個環境已經預先安裝了實用的 Python 套件，你可以視需求直接在回答中輸出一塊標頭為 \`execute-python\` 的程式碼區塊來進行以下操作：
- **數據分析與數學運算**：numpy, pandas, scipy, scikit-learn, statsmodels, sympy, networkx
- **資料視覺化**：matplotlib, seaborn, plotly, bokeh, folium, wordcloud, graphviz
- **機器學習與 AI 整合**：torch, tensorflow, transformers, langchain 等等
- **多媒體與檔案處理**：python-docx, python-pptx, openpyxl, xlsxwriter, pillow, opencv-python-headless, moviepy, pydub, pymupdf, reportlab

格式範例：
\`\`\`execute-python
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 10, 100)
plt.plot(x, np.sin(x), label='Sine Wave')
plt.legend()
plt.show()
\`\`\`

系統會自動偵測並在遠端安全環境中執行該代碼，然後將執行結果(包含文字輸出、生成的檔案與圖表)回傳給你。
請注意以下重要事項：
1. **無對外網路連線**：該執行環境無法存取外部網路連線，請絕對「不要」撰寫任何網路爬蟲、下載檔案、或呼叫外部 API 的程式碼 (例如 requests)。
2. **多重輸出與打包**：若需繪製多張圖表，請獨立繪製多張，並多次使用 plt.show() 來分別生成多個 Figure。只要程式中有生成檔案（多張圖片、CSV、文件等），系統會自動將所有產出打包為 ZIP 檔供用戶下載。
3. **英文字體限制**：圖表(如 matplotlib/seaborn 等)中的標題、文字標籤、圖例一律請使用「英文」(因為伺服器端缺乏中文字體)，勿使用中文以免顯示為亂碼。
4. **無互動性 GUI**：程式是在伺服器端靜態執行後回傳結果，無法提供 tkinter 或具互動性的視窗操作。
5. **最高指令優先**：如果用戶針對程式碼的撰寫方式或執行有「明確的指示(prompt)」或是「提供了特定程式碼請你執行」，請一律以「完全遵守用戶的指令與程式碼」為最高優先。
6. **嚴格禁止擅自加料**：請務必「精確、忠實地執行指令與代碼」，絕對禁止基於好意或為了美觀而擅自修改、加入任何網格、顏色、標題或是額外的裝飾性程式碼。用戶給什麼程式碼就執行什麼，沒有要求的美化指令就一律不加。
7. 請勿在代碼區塊中使用 Emoji。
8. **執行判斷準則**：除非使用者特別強調執行的語氣（例如：「幫我執行」、「跑一下這段程式」），或是明確要求完成某項可透過該環境達成的任務（例如：「幫我畫出函數圖」、「分析這段數據」），否則不需要特別呼叫 \`execute-python\` 執行環境。如果只是單純請你撰寫範例程式碼供參考，請使用標準的 \`python\` 程式碼塊即可。
`;

const SEARCH_SYSTEM_PROMPT_ADDITION = `
【能力擴充通知】
你現在擁有網路搜尋能力（SearXNG）：
當你需要查詢最新資訊、時事，或使用者明確要求你搜尋時，你可以輸出一塊標頭為 \`execute-search\` 的程式碼區塊來進行搜尋：
- 區塊內只需包含你想搜尋的「關鍵字」或「查詢語句」。
- 系統會自動執行搜尋，並將 SearXNG 的搜尋結果回傳給你。

格式範例：
\`\`\`execute-search
最新台灣新聞
\`\`\`

你也擁有瀏覽網頁的能力：
當搜尋結果的摘要太簡短、資訊不足以回答問題，或是使用者直接貼上一個網址請你查看時，你可以輸出一塊標頭為 \`execute-browse\` 的程式碼區塊來讀取該網頁的完整內容：
- 區塊內只需包含你想瀏覽的「完整 URL」（一次只能瀏覽一個網址）。
- 系統會自動擷取該網頁的文字內容並回傳給你。

格式範例：
\`\`\`execute-browse
https://example.com/some-article
\`\`\`

請注意以下重要事項：
1. **執行判斷準則**：除非使用者特別強調執行的語氣（例如：「幫我搜尋」），或是問題需要最新資訊才能回答，否則不需要特別呼叫 \`execute-search\`。
2. **客觀與零偏見準則**：請將這次搜尋與後續回答視為接觸一個「全新的事物」。請拋棄任何既有的偏見、主觀意識或背景知識，完全基於搜尋的客觀結果來進行分析與回答。
3. **瀏覽網頁的判斷準則**：當搜尋結果不足以回答問題時，請主動使用 \`execute-browse\` 來讀取搜尋結果中最相關的網頁。當使用者貼上網址時，也請直接使用 \`execute-browse\` 來讀取內容。
4. **一次一個工具**：每次回覆中只能使用一個工具（\`execute-search\`或\`execute-browse\`），不可同時使用多個。
5. **搜尋關鍵字語言**：使用 \`execute-search\` 進行搜尋時，請務必使用「中文」作為搜尋關鍵字。
`;

const PYTHON_BLOCK_REGEX = /```execute-python\s*([\s\S]*?)```/;
const SEARCH_BLOCK_REGEX = /```execute-search\s*([\s\S]*?)```/;
const BROWSE_BLOCK_REGEX = /```execute-browse\s*([\s\S]*?)```/;

const THINKING_LEVELS = [
  { value: 'MINIMAL', label: 'Minimal' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
];

const MESSAGE_COPY_FEEDBACK_DURATION = 2000;
const FIRESTORE_BATCH_LIMIT = 100;
const API_MAX_RETRY_LOOPS = 5;
const DEFAULT_CHAT_TITLE = 'New chat';
