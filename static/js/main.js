const API_KEY = "AIzaSyDo6isc-iR_Sv0XIznh4Tx7b8sn9pfKa6I";
const MODEL = "gemma-3-27b-it";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

const auth = firebase.auth();
const db = firebase.firestore();
// Force long polling to avoid QUIC transport errors on restricted networks.
try {
    db.settings({
        experimentalAutoDetectLongPolling: true,
        useFetchStreams: false,
        merge: true,
    });
} catch (e) {
    console.warn('無法套用 Firestore 連線設定', e);
}

let history = [];
let currentConversationId = null;
let currentUser = null;
let isCreatingConversation = false;
let isAwaitingResponse = false;
let isEditingMessage = false;

const chatBoxEl = document.getElementById("chat-box");
const inputEl = document.getElementById("user-input");
const sendButtonEl = document.getElementById("send-button");
const conversationListEl = document.getElementById("conversation-list");
const newChatBtn = document.getElementById("new-chat-btn");
const loginBtn = document.getElementById("login-btn");
const signupBtn = document.getElementById("signup-btn");
const loginPageBtn = document.getElementById("login-page-btn");
const logoutBtn = document.getElementById("logout-btn");
const authEmailEl = document.getElementById("auth-email");
const authPasswordEl = document.getElementById("auth-password");
const authHintEl = document.getElementById("auth-hint");
const userNameEl = document.getElementById("user-name");
const userAvatarEl = document.getElementById("user-avatar");
const mobileMenuBtn = document.getElementById("mobile-menu-btn");
const mobileBackdrop = document.getElementById("mobile-backdrop");
const promptToolsListEl = document.getElementById("prompt-tools");
const promptToolsCounterEl = document.getElementById("prompt-tools-counter");
const promptToolsBlockEl = document.getElementById("prompt-tools-block");

const MESSAGE_COPY_FEEDBACK_DURATION = 2000;
const MESSAGE_COPY_ICON = `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon"><path d="M12.668 10.667C12.668 9.95614 12.668 9.46258 12.6367 9.0791C12.6137 8.79732 12.5758 8.60761 12.5244 8.46387L12.4688 8.33399C12.3148 8.03193 12.0803 7.77885 11.793 7.60254L11.666 7.53125C11.508 7.45087 11.2963 7.39395 10.9209 7.36328C10.5374 7.33197 10.0439 7.33203 9.33301 7.33203H6.5C5.78896 7.33203 5.29563 7.33195 4.91211 7.36328C4.63016 7.38632 4.44065 7.42413 4.29688 7.47559L4.16699 7.53125C3.86488 7.68518 3.61186 7.9196 3.43555 8.20703L3.36524 8.33399C3.28478 8.49198 3.22795 8.70352 3.19727 9.0791C3.16595 9.46259 3.16504 9.95611 3.16504 10.667V13.5C3.16504 14.211 3.16593 14.7044 3.19727 15.0879C3.22797 15.4636 3.28473 15.675 3.36524 15.833L3.43555 15.959C3.61186 16.2466 3.86474 16.4807 4.16699 16.6348L4.29688 16.6914C4.44063 16.7428 4.63025 16.7797 4.91211 16.8027C5.29563 16.8341 5.78896 16.835 6.5 16.835H9.33301C10.0439 16.835 10.5374 16.8341 10.9209 16.8027C11.2965 16.772 11.508 16.7152 11.666 16.6348L11.793 16.5645C12.0804 16.3881 12.3148 16.1351 12.4688 15.833L12.5244 15.7031C12.5759 15.5594 12.6137 15.3698 12.6367 15.0879C12.6681 14.7044 12.668 14.211 12.668 13.5V10.667ZM13.998 12.665C14.4528 12.6634 14.8011 12.6602 15.0879 12.6367C15.4635 12.606 15.675 12.5492 15.833 12.4688L15.959 12.3975C16.2466 12.2211 16.4808 11.9682 16.6348 11.666L16.6914 11.5361C16.7428 11.3924 16.7797 11.2026 16.8027 10.9209C16.8341 10.5374 16.835 10.0439 16.835 9.33301V6.5C16.835 5.78896 16.8341 5.29563 16.8027 4.91211C16.7797 4.63025 16.7428 4.44063 16.6914 4.29688L16.6348 4.16699C16.4807 3.86474 16.2466 3.61186 15.959 3.43555L15.833 3.36524C15.675 3.28473 15.4636 3.22797 15.0879 3.19727C14.7044 3.16593 14.211 3.16504 13.5 3.16504H10.667C9.9561 3.16504 9.46259 3.16595 9.0791 3.19727C8.79739 3.22028 8.6076 3.2572 8.46387 3.30859L8.33399 3.36524C8.03176 3.51923 7.77886 3.75343 7.60254 4.04102L7.53125 4.16699C7.4508 4.32498 7.39397 4.53655 7.36328 4.91211C7.33985 5.19893 7.33562 5.54719 7.33399 6.00195H9.33301C10.022 6.00195 10.5791 6.00131 11.0293 6.03809C11.4873 6.07551 11.8937 6.15471 12.2705 6.34668L12.4883 6.46875C12.984 6.7728 13.3878 7.20854 13.6533 7.72949L13.7197 7.87207C13.8642 8.20859 13.9292 8.56974 13.9619 8.9707C13.9987 9.42092 13.998 9.97799 13.998 10.667V12.665ZM18.165 9.33301C18.165 10.022 18.1657 10.5791 18.1289 11.0293C18.0961 11.4302 18.0311 11.7914 17.8867 12.1279L17.8203 12.2705C17.5549 12.7914 17.1509 13.2272 16.6553 13.5313L16.4365 13.6533C16.0599 13.8452 15.6541 13.9245 15.1963 13.9619C14.8593 13.9895 14.4624 13.9935 13.9951 13.9951C13.9935 14.4624 13.9895 14.8593 13.9619 15.1963C13.9292 15.597 13.864 15.9576 13.7197 16.2939L13.6533 16.4365C13.3878 16.9576 12.9841 17.3941 12.4883 17.6982L12.2705 17.8203C11.8937 18.0123 11.4873 18.0915 11.0293 18.1289C10.5791 18.1657 10.022 18.165 9.33301 18.165H6.5C5.81091 18.165 5.25395 18.1657 4.80371 18.1289C4.40306 18.0962 4.04235 18.031 3.70606 17.8867L3.56348 17.8203C3.04244 17.5548 2.60585 17.151 2.30176 16.6553L2.17969 16.4365C1.98788 16.0599 1.90851 15.6541 1.87109 15.1963C1.83431 14.746 1.83496 14.1891 1.83496 13.5V10.667C1.83496 9.978 1.83432 9.42091 1.87109 8.9707C1.90851 8.5127 1.98772 8.10625 2.17969 7.72949L2.30176 7.51172C2.60586 7.0159 3.04236 6.6122 3.56348 6.34668L3.70606 6.28027C4.04237 6.136 4.40303 6.07083 4.80371 6.03809C5.14051 6.01057 5.53708 6.00551 6.00391 6.00391C6.00551 5.53708 6.01057 5.14051 6.03809 4.80371C6.0755 4.34588 6.15483 3.94012 6.34668 3.56348L6.46875 3.34473C6.77282 2.84912 7.20856 2.44514 7.72949 2.17969L7.87207 2.11328C8.20855 1.96886 8.56979 1.90385 8.9707 1.87109C9.42091 1.83432 9.978 1.83496 10.667 1.83496H13.5C14.1891 1.83496 14.746 1.83431 15.1963 1.87109C15.6541 1.90851 16.0599 1.98788 16.4365 2.17969L16.6553 2.30176C17.151 2.60585 17.5548 3.04244 17.8203 3.56348L17.8867 3.70606C18.031 4.04235 18.0962 4.40306 18.1289 4.80371C18.1657 5.25395 18.165 5.81091 18.165 6.5V9.33301Z"></path></svg>
`;
const MESSAGE_COPY_SUCCESS_ICON = `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon"><path d="M15.4835 4.14551C15.6794 3.85999 16.069 3.78747 16.3545 3.9834C16.6401 4.17933 16.7126 4.56897 16.5167 4.85449L8.9688 15.8545C8.86289 16.0088 8.69334 16.1085 8.50689 16.125C8.32053 16.1415 8.13628 16.0737 8.00494 15.9404L3.55377 11.4219L4.00005 10.9824L4.44634 10.542L8.36431 14.5176L15.4835 4.14551ZM3.55962 10.5352C3.80622 10.2922 4.20328 10.2955 4.44634 10.542L3.55377 11.4219C3.31073 11.1752 3.31297 10.7782 3.55962 10.5352Z"></path></svg>
`;
const MESSAGE_EDIT_ICON = `
<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon"><path d="M11.3312 3.56837C12.7488 2.28756 14.9376 2.33009 16.3038 3.6963L16.4318 3.83106C17.6712 5.20294 17.6712 7.29708 16.4318 8.66895L16.3038 8.80372L10.0118 15.0947C9.68833 15.4182 9.45378 15.6553 9.22179 15.8457L8.98742 16.0225C8.78227 16.1626 8.56423 16.2832 8.33703 16.3828L8.10753 16.4756C7.92576 16.5422 7.73836 16.5902 7.5216 16.6348L6.75695 16.7705L4.36339 17.169C4.22053 17.1928 4.06908 17.2188 3.94054 17.2285C3.84177 17.236 3.70827 17.2386 3.56261 17.2031L3.41417 17.1543C3.19115 17.0586 3.00741 16.8908 2.89171 16.6797L2.84581 16.5859C2.75951 16.3846 2.76168 16.1912 2.7716 16.0596C2.7813 15.931 2.80736 15.7796 2.83117 15.6367L3.2296 13.2432L3.36437 12.4785C3.40893 12.2616 3.45789 12.0745 3.52453 11.8926L3.6173 11.6621C3.71685 11.4352 3.83766 11.2176 3.97765 11.0127L4.15343 10.7783C4.34386 10.5462 4.58164 10.312 4.90538 9.98829L11.1964 3.6963L11.3312 3.56837ZM5.84581 10.9287C5.49664 11.2779 5.31252 11.4634 5.18663 11.6162L5.07531 11.7627C4.98188 11.8995 4.90151 12.0448 4.83507 12.1963L4.77355 12.3506C4.73321 12.4607 4.70242 12.5761 4.66808 12.7451L4.54113 13.4619L4.14269 15.8555L4.14171 15.8574H4.14464L6.5382 15.458L7.25499 15.332C7.424 15.2977 7.5394 15.2669 7.64953 15.2266L7.80285 15.165C7.95455 15.0986 8.09947 15.0174 8.23644 14.9238L8.3839 14.8135C8.53668 14.6876 8.72225 14.5035 9.0714 14.1543L14.0587 9.16602L10.8331 5.94044L5.84581 10.9287ZM15.3634 4.63673C14.5281 3.80141 13.2057 3.74938 12.3097 4.48048L12.1368 4.63673L11.7735 5.00001L15.0001 8.22559L15.3634 7.86329L15.5196 7.68946C16.2015 6.85326 16.2015 5.64676 15.5196 4.81056L15.3634 4.63673Z"></path></svg>
`;

const SEND_ICON_DEFAULT = `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7 11L12 6L17 11M12 18V7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
`;

const SEND_ICON_PENDING = `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon">
        <path d="M4.5 5.75C4.5 5.05964 5.05964 4.5 5.75 4.5H14.25C14.9404 4.5 15.5 5.05964 15.5 5.75V14.25C15.5 14.9404 14.9404 15.5 14.25 15.5H5.75C5.05964 15.5 4.5 14.9404 4.5 14.25V5.75Z"></path>
    </svg>
`;

const ZG_QUOTES_TOOL_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" width="800px" height="800px" viewBox="0 0 32 32" fill="none">
<path d="M22.63 4.81C21.7696 3.92124 20.7393 3.2145 19.6003 2.73177C18.4614 2.24905 17.237 2.0002 16 2C13.6131 2 11.3239 2.94821 9.63604 4.63604C7.94821 6.32387 7 8.61305 7 11C7.08565 12.681 7.56521 14.3184 8.4 15.78C8.66 16.32 8.9 16.84 9.1 17.37L11.1 22.37C11.1721 22.5514 11.2958 22.7077 11.4557 22.8197C11.6157 22.9316 11.8049 22.9943 12 23H20C20.2003 23.0002 20.396 22.9402 20.5618 22.8279C20.7276 22.7156 20.8559 22.5561 20.93 22.37L22.93 17.37C23.15 16.8 23.39 16.27 23.63 15.75C24.4114 14.2789 24.878 12.6613 25 11C25.0449 9.86149 24.8579 8.72574 24.4505 7.66167C24.0431 6.5976 23.4237 5.62742 22.63 4.81Z" fill="#FBC02D"/>
<path d="M20 24H12C11.7348 24 11.4804 24.1054 11.2929 24.2929C11.1054 24.4804 11 24.7348 11 25V28C10.9996 28.1874 11.0519 28.3712 11.1509 28.5303C11.25 28.6894 11.3917 28.8175 11.56 28.9L13.56 29.9C13.6971 29.9664 13.8476 30.0006 14 30H18C18.1557 30.0022 18.3098 29.9679 18.45 29.9L20.45 28.9C20.6164 28.8161 20.7561 28.6874 20.8533 28.5284C20.9505 28.3694 21.0013 28.1864 21 28V25C21 24.7348 20.8946 24.4804 20.7071 24.2929C20.5196 24.1054 20.2652 24 20 24Z" fill="#FF6F00"/>
<path d="M20 14H12C11.8301 14.0003 11.6628 13.9574 11.5141 13.8751C11.3654 13.7929 11.2401 13.6741 11.15 13.53C11.0622 13.378 11.016 13.2055 11.016 13.03C11.016 12.8545 11.0622 12.682 11.15 12.53L13.15 8.53C13.2326 8.37471 13.3546 8.24395 13.5038 8.1509C13.6531 8.05785 13.8242 8.0058 14 8H18C18.2652 8 18.5196 8.10536 18.7071 8.29289C18.8946 8.48043 19 8.73478 19 9C19 9.26522 18.8946 9.51957 18.7071 9.70711C18.5196 9.89464 18.2652 10 18 10H14.65L13.65 12H20C20.2652 12 20.5196 12.1054 20.7071 12.2929C20.8946 12.4804 21 12.7348 21 13C21 13.2652 20.8946 13.5196 20.7071 13.7071C20.5196 13.8946 20.2652 14 20 14Z" fill="#FAFAFA"/>
<path d="M16 18C15.7348 18 15.4804 17.8946 15.2929 17.7071C15.1054 17.5196 15 17.2652 15 17V13C15 12.7348 15.1054 12.4804 15.2929 12.2929C15.4804 12.1054 15.7348 12 16 12C16.2652 12 16.5196 12.1054 16.7071 12.2929C16.8946 12.4804 17 12.7348 17 13V17C17 17.2652 16.8946 17.5196 16.7071 17.7071C16.5196 17.8946 16.2652 18 16 18Z" fill="#FAFAFA"/>
<path d="M16 2C13.6131 2 11.3239 2.94821 9.63604 4.63604C7.94821 6.32387 7 8.61305 7 11C7.08237 12.6744 7.55128 14.3071 8.37 15.77C8.63072 16.2909 8.86436 16.825 9.07 17.37L11.07 22.37C11.1441 22.5561 11.2724 22.7156 11.4382 22.8279C11.604 22.9402 11.7997 23.0002 12 23H16V2Z" fill="#FFEE58"/>
<path d="M12 24C11.7348 24 11.4804 24.1054 11.2929 24.2929C11.1054 24.4804 11 24.7348 11 25V28C11.0006 28.1847 11.0522 28.3656 11.1493 28.5227C11.2464 28.6798 11.3851 28.8069 11.55 28.89L13.55 29.89C13.6893 29.9614 13.8435 29.9991 14 30H16V24H12Z" fill="#FF8F00"/>
<path d="M18 10C18.2652 10 18.5196 9.89464 18.7071 9.70711C18.8946 9.51957 19 9.26522 19 9C19 8.73478 18.8946 8.48043 18.7071 8.29289C18.5196 8.10536 18.2652 8 18 8H16V10H18Z" fill="#FF6F00"/>
<path d="M20 12H16V14H20C20.2652 14 20.5196 13.8946 20.7071 13.7071C20.8946 13.5196 21 13.2652 21 13C21 12.7348 20.8946 12.4804 20.7071 12.2929C20.5196 12.1054 20.2652 12 20 12Z" fill="#FF6F00"/>
<path d="M13.6 12L14.6 10H16V8.00002H14C13.8136 7.99873 13.6306 8.04954 13.4716 8.14672C13.3126 8.2439 13.1839 8.38359 13.1 8.55002L11.1 12.55C11.0197 12.7064 10.9821 12.8812 10.9908 13.0567C10.9996 13.2323 11.0545 13.4024 11.15 13.55C11.2424 13.6904 11.3688 13.8053 11.5173 13.8839C11.6659 13.9626 11.8319 14.0025 12 14H16V12H13.6Z" fill="#FF8F00"/>
<path d="M15 13V17C15 17.2652 15.1054 17.5196 15.2929 17.7071C15.4804 17.8946 15.7348 18 16 18V12C15.7348 12 15.4804 12.1054 15.2929 12.2929C15.1054 12.4804 15 12.7348 15 13Z" fill="#FF8F00"/>
<path d="M16 12V18C16.2652 18 16.5196 17.8946 16.7071 17.7071C16.8946 17.5196 17 17.2652 17 17V13C17 12.7348 16.8946 12.4804 16.7071 12.2929C16.5196 12.1054 16.2652 12 16 12Z" fill="#FF6F00"/>
</svg>
`;

const DEFAULT_TOOL_PILL_ICON = `
    <svg xmlns="http://www.w3.org/2000/svg" width="800px" height="800px" viewBox="0 0 24 24" fill="none">
        <path d="M15.6316 7.63137C15.2356 7.23535 15.0376 7.03735 14.9634 6.80902C14.8981 6.60817 14.8981 6.39183 14.9634 6.19098C15.0376 5.96265 15.2356 5.76465 15.6316 5.36863L18.47 2.53026C17.7168 2.18962 16.8806 2 16.0002 2C12.6865 2 10.0002 4.68629 10.0002 8C10.0002 8.49104 10.0592 8.9683 10.1705 9.42509C10.2896 9.91424 10.3492 10.1588 10.3387 10.3133C10.3276 10.4751 10.3035 10.5612 10.2289 10.7051C10.1576 10.8426 10.0211 10.9791 9.74804 11.2522L3.50023 17.5C2.6718 18.3284 2.6718 19.6716 3.50023 20.5C4.32865 21.3284 5.6718 21.3284 6.50023 20.5L12.748 14.2522C13.0211 13.9791 13.1576 13.8426 13.2951 13.7714C13.4391 13.6968 13.5251 13.6727 13.6869 13.6616C13.8414 13.651 14.086 13.7106 14.5751 13.8297C15.0319 13.941 15.5092 14 16.0002 14C19.3139 14 22.0002 11.3137 22.0002 8C22.0002 7.11959 21.8106 6.28347 21.47 5.53026L18.6316 8.36863C18.2356 8.76465 18.0376 8.96265 17.8092 9.03684C17.6084 9.1021 17.3921 9.1021 17.1912 9.03684C16.9629 8.96265 16.7649 8.76465 16.3689 8.36863L15.6316 7.63137Z" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
`;

const TOOL_PILL_REMOVE_ICON = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M11.1152 3.91503C11.3868 3.73594 11.756 3.7658 11.9951 4.00488C12.2341 4.24395 12.264 4.61309 12.0849 4.88476L11.9951 4.99511L8.99018 7.99999L11.9951 11.0049L12.0849 11.1152C12.264 11.3869 12.2341 11.756 11.9951 11.9951C11.756 12.2342 11.3868 12.2641 11.1152 12.085L11.0048 11.9951L7.99995 8.99023L4.99506 11.9951C4.7217 12.2685 4.2782 12.2685 4.00483 11.9951C3.73146 11.7217 3.73146 11.2782 4.00483 11.0049L7.00971 7.99999L4.00483 4.99511L3.91499 4.88476C3.73589 4.61309 3.76575 4.24395 4.00483 4.00488C4.24391 3.7658 4.61305 3.73594 4.88471 3.91503L4.99506 4.00488L7.99995 7.00976L11.0048 4.00488L11.1152 3.91503Z"></path>
    </svg>
`;

const PROMPT_TOOLS = [];
(function initPromptTools() {
    const zgquotesContent = (typeof window !== 'undefined' && typeof window.ZG_QUOTES_APPENDIX === 'string')
        ? window.ZG_QUOTES_APPENDIX.trim()
        : '';
    if (zgquotesContent) {
        PROMPT_TOOLS.push({
            id: 'zg-quotes',
            label: '張國語錄',
            description: '附加張國語錄給模型參考',
            content: zgquotesContent,
            icon: ZG_QUOTES_TOOL_ICON,
        });
    }
})();
const activeToolIds = new Set();

function setElementVisibility(el, shouldShow) {
    if (!el) return;
    el.style.display = shouldShow ? '' : 'none';
}

function getToolById(id) {
    return PROMPT_TOOLS.find(tool => tool.id === id);
}

function getToolContent(tool) {
    if (!tool) return '';
    if (typeof tool.content === 'function') {
        const value = tool.content();
        return typeof value === 'string' ? value : '';
    }
    return typeof tool.content === 'string' ? tool.content : '';
}

function getToolIconMarkup(tool) {
    if (!tool) return DEFAULT_TOOL_PILL_ICON;
    if (typeof tool.icon === 'function') {
        const value = tool.icon();
        return (typeof value === 'string' && value.trim()) ? value : DEFAULT_TOOL_PILL_ICON;
    }
    if (typeof tool.icon === 'string' && tool.icon.trim()) {
        return tool.icon;
    }
    return DEFAULT_TOOL_PILL_ICON;
}

function updatePromptToolsCounter() {
    if (!promptToolsCounterEl) return;
    const count = activeToolIds.size;
    promptToolsCounterEl.textContent = count ? `已選 ${count} 個` : '未選取';
}

function updatePromptToolBlockVisibility() {
    if (!promptToolsBlockEl) return;
    promptToolsBlockEl.style.display = PROMPT_TOOLS.length ? '' : 'none';
}

function renderPromptTools() {
    if (!promptToolsListEl) return;
    updatePromptToolBlockVisibility();
    promptToolsListEl.innerHTML = '';
    PROMPT_TOOLS.forEach(tool => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tool-pill';
        button.dataset.toolId = tool.id;
        button.setAttribute('aria-pressed', activeToolIds.has(tool.id).toString());
        if (activeToolIds.has(tool.id)) {
            button.classList.add('active');
        }
        const safeLabel = escapeHtml(tool.label || tool.id);
        const description = tool.description ? escapeHtml(tool.description) : '';
        const iconMarkup = getToolIconMarkup(tool);
        button.innerHTML = `
            <div class="tool-pill-icon">${iconMarkup}</div>
            <span class="tool-pill-label">${safeLabel}</span>
            <div class="tool-pill-remove">${TOOL_PILL_REMOVE_ICON}</div>
        `;
        if (description) {
            button.title = description;
        }
        button.addEventListener('click', () => togglePromptTool(tool.id));
        promptToolsListEl.appendChild(button);
    });
    updatePromptToolsCounter();
}

function togglePromptTool(id) {
    if (activeToolIds.has(id)) {
        activeToolIds.delete(id);
    } else {
        activeToolIds.add(id);
    }
    renderPromptTools();
}

function buildToolContextPayload() {
    if (!activeToolIds.size) return '';
    const sections = [];
    activeToolIds.forEach((id) => {
        const tool = getToolById(id);
        const content = getToolContent(tool).trim();
        if (!tool || !content) return;
        const label = tool.label || id;
        sections.push(`【${label}】\n${content}`);
    });
    if (!sections.length) return '';
    return sections.join('\n\n');
}

function updateSendButtonState() {
    if (!sendButtonEl || !inputEl) return;
    const hasText = inputEl.value.trim() !== '';
    sendButtonEl.disabled = isAwaitingResponse || !hasText;
    sendButtonEl.setAttribute('aria-busy', isAwaitingResponse.toString());
    const iconMarkup = isAwaitingResponse ? SEND_ICON_PENDING : SEND_ICON_DEFAULT;
    if (sendButtonEl.innerHTML.trim() !== iconMarkup.trim()) {
        sendButtonEl.innerHTML = iconMarkup;
    }
}

function isConversationActionLocked() {
    return isAwaitingResponse || isEditingMessage;
}

function getConversationLockMessage(actionLabel = '操作') {
    if (isAwaitingResponse) {
        return `模型回應中，暫時無法${actionLabel}`;
    }
    if (isEditingMessage) {
        return `編輯訊息期間，暫時無法${actionLabel}`;
    }
    return '';
}

function notifyConversationActionLocked(actionLabel) {
    const msg = getConversationLockMessage(actionLabel);
    if (msg) {
        setAuthHint(msg, true);
    }
}

function updateNewChatButtonState() {
    if (!newChatBtn) return;
    const disabled = !currentUser || isConversationActionLocked();
    newChatBtn.classList.toggle('disabled', disabled);
    newChatBtn.setAttribute('aria-disabled', disabled.toString());
    if (disabled) {
        newChatBtn.setAttribute('disabled', 'true');
    } else {
        newChatBtn.removeAttribute('disabled');
    }
}

function updateConversationItemsState() {
    if (!conversationListEl) return;
    const locked = isConversationActionLocked();
    const items = conversationListEl.querySelectorAll('.history-item');
    items.forEach((item) => {
        item.classList.toggle('disabled', locked);
        item.setAttribute('aria-disabled', locked.toString());
    });
}

function updateEditButtonsState() {
    const shouldDisable = isAwaitingResponse;
    const editButtons = document.querySelectorAll('.edit-message-btn');
    editButtons.forEach((btn) => {
        if (!btn) return;
        btn.disabled = shouldDisable;
        btn.setAttribute('aria-disabled', shouldDisable.toString());
        btn.classList.toggle('disabled', shouldDisable);
    });
}

function updateConversationLockUI() {
    updateNewChatButtonState();
    updateConversationItemsState();
    updateEditButtonsState();
}

function setEditingState(isEditing) {
    const nextState = !!isEditing;
    if (isEditingMessage === nextState) return;
    isEditingMessage = nextState;
    updateConversationLockUI();
}

function setAuthHint(msg, isError = false) {
    const text = msg || '';
    const color = isError ? '#ef4444' : '#b4b4b4';
    if (authHintEl) {
        authHintEl.textContent = text;
        authHintEl.style.color = color;
    }
}

function clearAuthFields(clearEmail = false) {
    if (authPasswordEl) authPasswordEl.value = '';
    if (clearEmail && authEmailEl) authEmailEl.value = '';
}

function toggleMobileSidebar(forceOpen = null) {
    const shouldOpen = forceOpen !== null ? forceOpen : !document.body.classList.contains('sidebar-open');
    document.body.classList.toggle('sidebar-open', shouldOpen);
}

function closeMobileSidebar() {
    document.body.classList.remove('sidebar-open');
}

function updateUserProfile(user) {
    if (!userNameEl || !userAvatarEl) return;
    if (user) {
        userNameEl.textContent = user.email || 'User';
        userAvatarEl.textContent = (user.email || 'U').slice(0, 1).toUpperCase();
    } else {
        userNameEl.textContent = 'Guest';
        userAvatarEl.textContent = 'G';
    }
}

function updateAuthUI(user) {
    const isLoggedIn = !!user;
    setElementVisibility(loginBtn, !isLoggedIn);
    setElementVisibility(signupBtn, !isLoggedIn);
    setElementVisibility(loginPageBtn, !isLoggedIn);
    setElementVisibility(logoutBtn, isLoggedIn);

    if (authEmailEl) {
        authEmailEl.disabled = isLoggedIn;
        authEmailEl.value = isLoggedIn ? (user?.email || '') : '';
    }

    if (authPasswordEl) {
        authPasswordEl.disabled = isLoggedIn;
        authPasswordEl.value = '';
    }
    updateNewChatButtonState();
}

function clearChatUI() {
    chatBoxEl.innerHTML = '';
    history = [];
}

function clearHistoryList() {
    if (!conversationListEl) return;
    conversationListEl.innerHTML = '<div class="history-empty">登入後會顯示您的對話</div>';
}

function escapeHtml(text) {
    if (typeof text !== "string") return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function markdownToHtml(mdText) {
    if (typeof mdText !== "string") return "";

    if (typeof marked !== 'undefined') {
        marked.setOptions({
            highlight: function (code, lang) {
                if (typeof hljs !== 'undefined') {
                    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                    return hljs.highlight(code, { language }).value;
                }
                return code;
            },
            langPrefix: 'hljs language-'
        });

        let html = marked.parse(mdText);

        const div = document.createElement('div');
        div.innerHTML = html;

        const preBlocks = div.querySelectorAll('pre');
        preBlocks.forEach(pre => {
            const code = pre.querySelector('code');
            let lang = 'text';
            if (code && code.className) {
                const match = code.className.match(/language-([a-zA-Z0-9-]+)/);
                if (match) lang = match[1];
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'code-container';

            const header = document.createElement('div');
            header.className = 'code-header';
            header.innerHTML = `
                <span>${lang}</span>
                <button type="button" class="copy-button">
                    <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="14" width="14" xmlns="http://www.w3.org/2000/svg"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    Copy code
                </button>
            `;

            const newPre = pre.cloneNode(true);

            wrapper.appendChild(header);
            wrapper.appendChild(newPre);

            pre.parentNode.replaceChild(wrapper, pre);
        });

        return div.innerHTML;
    }

    return escapeHtml(mdText);
}

function setMessageCopyButtonState(button, state = 'default') {
    if (!button) return;
    const originalLabel = button.dataset.originalLabel || button.getAttribute('aria-label') || '複製';
    if (!button.dataset.originalLabel) {
        button.dataset.originalLabel = originalLabel;
    }

    if (state === 'copied') {
        button.classList.remove('copy-error');
        button.classList.add('copy-success');
        button.setAttribute('aria-label', '已複製');
        button.setAttribute('aria-pressed', 'true');
        button.dataset.state = 'open';
        return;
    }

    if (state === 'error') {
        button.classList.remove('copy-success');
        button.classList.add('copy-error');
        button.setAttribute('aria-label', '複製失敗');
        button.setAttribute('aria-pressed', 'false');
        button.dataset.state = 'error';
        return;
    }

    button.classList.remove('copy-error', 'copy-success');
    button.setAttribute('aria-label', originalLabel);
    button.setAttribute('aria-pressed', 'false');
    button.dataset.state = 'closed';
}

function flashMessageCopyState(button, state) {
    if (!button) return;
    setMessageCopyButtonState(button, state);
    if (state === 'default') return;
    if (button._copyTimer) {
        clearTimeout(button._copyTimer);
    }
    button._copyTimer = setTimeout(() => {
        setMessageCopyButtonState(button, 'default');
        button._copyTimer = null;
    }, MESSAGE_COPY_FEEDBACK_DURATION);
}

function initCopyHandler(element) {
    if (!element) return;
    element.addEventListener('click', async (ev) => {
        const codeBtn = ev.target.closest('.copy-button');
        if (codeBtn) {
            const container = codeBtn.closest('.code-container');
            const codeEl = container?.querySelector('code');
            const textToCopy = codeEl ? codeEl.innerText : '';

            try {
                await navigator.clipboard.writeText(textToCopy);
                const originalHtml = codeBtn.innerHTML;
                codeBtn.innerHTML = `
                <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="14" width="14" xmlns="http://www.w3.org/2000/svg"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Copied!
            `;
                setTimeout(() => codeBtn.innerHTML = originalHtml, 2000);
            } catch (err) {
                console.error('Copy failed', err);
                codeBtn.textContent = 'Failed';
            }
            return;
        }

        const messageBtn = ev.target.closest('.copy-message-btn');
        if (messageBtn) {
            const wrapper = messageBtn.closest('.message-wrapper');
            const datasetValue = wrapper?.dataset.raw || '';
            const fallbackValue = wrapper?.querySelector('.text-content')?.innerText || '';
            const textToCopy = datasetValue || fallbackValue;

            if (!textToCopy) {
                flashMessageCopyState(messageBtn, 'error');
                return;
            }

            try {
                await navigator.clipboard.writeText(textToCopy);
                flashMessageCopyState(messageBtn, 'copied');
            } catch (err) {
                console.error('複製訊息失敗', err);
                flashMessageCopyState(messageBtn, 'error');
            }
            return;
        }

        const editBtn = ev.target.closest('.edit-message-btn');
        if (!editBtn) return;
        if (isAwaitingResponse) {
            return;
        }

        const wrapper = editBtn.closest('.message-wrapper');
        const indexStr = wrapper?.dataset.index;
        const editIndex = Number(indexStr);
        if (!Number.isFinite(editIndex) || editIndex < 0 || editIndex >= history.length) return;

        const targetMessage = history[editIndex];
        if (!targetMessage || targetMessage.role !== 'user') return;

        const textToEdit = targetMessage.displayText || targetMessage.parts?.[0]?.text || '';

        const messagesToRemove = history.slice(editIndex);
        history = history.slice(0, editIndex);
        renderHistory();
        setEditingState(true);

        const idsToDelete = messagesToRemove
            .map(msg => msg?.messageId)
            .filter(id => typeof id === 'string' && id.length > 0);

        if (idsToDelete.length && currentConversationId) {
            await deleteMessagesByIds(currentConversationId, idsToDelete);
        }

        inputEl.value = textToEdit;
        inputEl.style.height = 'auto';
        inputEl.style.height = (inputEl.scrollHeight) + 'px';
        inputEl.focus();
        const pos = inputEl.value.length;
        inputEl.setSelectionRange(pos, pos);
        updateSendButtonState();
    });
}

function renderMessage(role, content, isError = false, displayContent = null, messageIndex = null) {
    const isUser = role === "user";
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message-wrapper';
    msgDiv.dataset.role = role;

    const viewText = typeof displayContent === 'string' ? displayContent : content;
    const normalizedText = typeof viewText === 'string' ? viewText : '';
    msgDiv.dataset.raw = normalizedText;
    if (typeof messageIndex === 'number' && !Number.isNaN(messageIndex)) {
        msgDiv.dataset.index = String(messageIndex);
    } else {
        delete msgDiv.dataset.index;
    }

    let innerContent = "";
    if (isError) {
        innerContent = `<div style="color: #ef4444;">${escapeHtml(normalizedText)}</div>`;
    } else if (isUser) {
        innerContent = `<p>${escapeHtml(normalizedText).replace(/\n/g, '<br>')}</p>`;
    } else {
        innerContent = markdownToHtml(normalizedText);
    }

    const iconHtml = isUser
        ? ''
        : `<div class="role-icon icon-model"><svg xmlns="http://www.w3.org/2000/svg" fill="#ffffff" fill-rule="evenodd" height="1em" style="flex:none;line-height:1" viewBox="0 0 24 24" width="1em"><path d="M12.34 5.953a8.233 8.233 0 01-.247-1.125V3.72a8.25 8.25 0 015.562 2.232H12.34zm-.69 0c.113-.373.199-.755.257-1.145V3.72a8.25 8.25 0 00-5.562 2.232h5.304zm-5.433.187h5.373a7.98 7.98 0 01-.267.696 8.41 8.41 0 01-1.76 2.65L6.216 6.14zm-.264-.187H2.977v.187h2.915a8.436 8.436 0 00-2.357 5.767H0v.186h3.535a8.436 8.436 0 002.357 5.767H2.977v.186h2.976v2.977h.187v-2.915a8.436 8.436 0 005.767 2.357V24h.186v-3.535a8.436 8.436 0 005.767-2.357v2.915h.186v-2.977h2.977v-.186h-2.915a8.436 8.436 0 002.357-5.767H24v-.186h-3.535a8.436 8.436 0 00-2.357-5.767h2.915v-.187h-2.977V2.977h-.186v2.915a8.436 8.436 0 00-5.767-2.357V0h-.186v3.535A8.436 8.436 0 006.14 5.892V2.977h-.187v2.976zm6.14 14.326a8.25 8.25 0 005.562-2.233H12.34c-.108.367-.19.743-.247 1.126v1.107zm-.186-1.087a8.015 8.015 0 00-.258-1.146H6.345a8.25 8.25 0 005.562 2.233v-1.087zm-8.186-7.285h1.107a8.23 8.23 0 001.125-.247V6.345a8.25 8.25 0 00-2.232 5.562zm1.087.186H3.72a8.25 8.25 0 002.232 5.562v-5.304a8.012 8.012 0 00-1.145-.258zm15.47-.186a8.25 8.25 0 00-2.232-5.562v5.315c.367.108.743.19 1.126.247h1.107zm-1.086.186c-.39.058-.772.144-1.146.258v5.304a8.25 8.25 0 002.233-5.562h-1.087zm-1.332 5.69V12.41a7.97 7.97 0 00-.696.267 8.409 8.409 0 00-2.65 1.76l3.346 3.346zm0-6.18v-5.45l-.012-.013h-5.451c.076.235.162.468.26.696a8.698 8.698 0 001.819 2.688 8.698 8.698 0 002.688 1.82c.228.097.46.183.696.259zM6.14 17.848V12.41c.235.078.468.167.696.267a8.403 8.403 0 012.688 1.799 8.404 8.404 0 011.799 2.688c.1.228.19.46.267.696H6.152l-.012-.012zm0-6.245V6.326l3.29 3.29a8.716 8.716 0 01-2.594 1.728 8.14 8.14 0 01-.696.259zm6.257 6.257h5.277l-3.29-3.29a8.716 8.716 0 00-1.728 2.594 8.135 8.135 0 00-.259.696zm-2.347-7.81a9.435 9.435 0 01-2.88 1.96 9.14 9.14 0 012.88 1.94 9.14 9.14 0 011.94 2.88 9.435 9.435 0 011.96-2.88 9.14 9.14 0 012.88-1.94 9.435 9.435 0 01-2.88-1.96 9.434 9.434 0 01-1.96-2.88 9.14 9.14 0 01-1.94 2.88z"/></svg></div>`;

    const editButtonDisabledAttr = isAwaitingResponse ? ' disabled aria-disabled="true"' : ' aria-disabled="false"';
    const editButtonHtml = isUser
        ? `
            <button type="button" class="edit-message-btn message-action-btn text-token-text-secondary hover:bg-token-bg-secondary rounded-lg" aria-label="編輯訊息"${editButtonDisabledAttr}>
                <span class="message-action-inner flex items-center justify-center touch:w-10 h-8 w-8">
                    ${MESSAGE_EDIT_ICON}
                </span>
            </button>
        `
        : '';

    msgDiv.innerHTML = `
        <div class="message-content">
            ${iconHtml}
            <div class="text-content">${innerContent}</div>
        </div>
        <div class="message-footer">
            <button type="button" class="copy-message-btn message-action-btn text-token-text-secondary hover:bg-token-bg-secondary rounded-lg" aria-label="複製" aria-pressed="false" data-testid="copy-turn-action-button" data-state="closed">
                <span class="copy-button-inner message-action-inner flex items-center justify-center touch:w-10 h-8 w-8">
                    <span class="copy-icon copy-icon-default" aria-hidden="true">${MESSAGE_COPY_ICON}</span>
                    <span class="copy-icon copy-icon-success" aria-hidden="true">${MESSAGE_COPY_SUCCESS_ICON}</span>
                </span>
            </button>
            ${editButtonHtml}
        </div>
    `;

    chatBoxEl.appendChild(msgDiv);

    requestAnimationFrame(() => {
        chatBoxEl.scrollTop = chatBoxEl.scrollHeight;
    });
}

function showLoading() {
    const loadingId = 'loading-' + Date.now();
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message-wrapper';
    msgDiv.id = loadingId;
    msgDiv.innerHTML = `
        <div class="message-content">
            <div class="role-icon icon-model"><svg xmlns="http://www.w3.org/2000/svg" fill="#ffffff" fill-rule="evenodd" height="1em" style="flex:none;line-height:1" viewBox="0 0 24 24" width="1em"><path d="M12.34 5.953a8.233 8.233 0 01-.247-1.125V3.72a8.25 8.25 0 015.562 2.232H12.34zm-.69 0c.113-.373.199-.755.257-1.145V3.72a8.25 8.25 0 00-5.562 2.232h5.304zm-5.433.187h5.373a7.98 7.98 0 01-.267.696 8.41 8.41 0 01-1.76 2.65L6.216 6.14zm-.264-.187H2.977v.187h2.915a8.436 8.436 0 00-2.357 5.767H0v.186h3.535a8.436 8.436 0 002.357 5.767H2.977v.186h2.976v2.977h.187v-2.915a8.436 8.436 0 005.767 2.357V24h.186v-3.535a8.436 8.436 0 005.767-2.357v2.915h.186v-2.977h2.977v-.186h-2.915a8.436 8.436 0 002.357-5.767H24v-.186h-3.535a8.436 8.436 0 00-2.357-5.767h2.915v-.187h-2.977V2.977h-.186v2.915a8.436 8.436 0 00-5.767-2.357V0h-.186v3.535A8.436 8.436 0 006.14 5.892V2.977h-.187v2.976zm6.14 14.326a8.25 8.25 0 005.562-2.233H12.34c-.108.367-.19.743-.247 1.126v1.107zm-.186-1.087a8.015 8.015 0 00-.258-1.146H6.345a8.25 8.25 0 005.562 2.233v-1.087zm-8.186-7.285h1.107a8.23 8.23 0 001.125-.247V6.345a8.25 8.25 0 00-2.232 5.562zm1.087.186H3.72a8.25 8.25 0 002.232 5.562v-5.304a8.012 8.012 0 00-1.145-.258zm15.47-.186a8.25 8.25 0 00-2.232-5.562v5.315c.367.108.743.19 1.126.247h1.107zm-1.086.186c-.39.058-.772.144-1.146.258v5.304a8.25 8.25 0 002.233-5.562h-1.087zm-1.332 5.69V12.41a7.97 7.97 0 00-.696.267 8.409 8.409 0 00-2.65 1.76l3.346 3.346zm0-6.18v-5.45l-.012-.013h-5.451c.076.235.162.468.26.696a8.698 8.698 0 001.819 2.688 8.698 8.698 0 002.688 1.82c.228.097.46.183.696.259zM6.14 17.848V12.41c.235.078.468.167.696.267a8.403 8.403 0 012.688 1.799 8.404 8.404 0 011.799 2.688c.1.228.19.46.267.696H6.152l-.012-.012zm0-6.245V6.326l3.29 3.29a8.716 8.716 0 01-2.594 1.728 8.14 8.14 0 01-.696.259zm6.257 6.257h5.277l-3.29-3.29a8.716 8.716 0 00-1.728 2.594 8.135 8.135 0 00-.259.696zm-2.347-7.81a9.435 9.435 0 01-2.88 1.96 9.14 9.14 0 012.88 1.94 9.14 9.14 0 011.94 2.88 9.435 9.435 0 011.96-2.88 9.14 9.14 0 012.88-1.94 9.435 9.435 0 01-2.88-1.96 9.434 9.434 0 01-1.96-2.88 9.14 9.14 0 01-1.94 2.88z"/></svg></div>
            <div class="text-content">
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        </div>
    `;
    chatBoxEl.appendChild(msgDiv);
    chatBoxEl.scrollTop = chatBoxEl.scrollHeight;
    return loadingId;
}

function removeLoading(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function renderConversationList(conversations) {
    if (!conversationListEl) return;
    if (!conversations.length) {
        conversationListEl.innerHTML = '<div class="history-empty">尚無對話，點擊「New chat」建立</div>';
        return;
    }

    conversationListEl.innerHTML = '';
    const locked = isConversationActionLocked();
    conversations.forEach(conv => {
        const item = document.createElement('div');
        const baseClass = 'history-item' + (conv.id === currentConversationId ? ' active' : '');
        item.className = baseClass + (locked ? ' disabled' : '');
        item.dataset.id = conv.id;
        item.setAttribute('aria-disabled', locked.toString());

        const title = document.createElement('span');
        title.className = 'history-title';
        title.textContent = conv.title || '未命名對話';

        const actions = document.createElement('div');
        actions.className = 'history-actions';

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'delete-conv-btn';
        deleteBtn.title = '刪除此對話';
        deleteBtn.innerHTML = `
            <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="14" width="14" xmlns="http://www.w3.org/2000/svg"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>
        `;
        deleteBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            deleteConversation(conv.id);
        });

        actions.appendChild(deleteBtn);

        item.appendChild(title);
        item.appendChild(actions);

        item.addEventListener('click', () => {
            if (isConversationActionLocked()) {
                notifyConversationActionLocked('切換對話');
                return;
            }
            if (conv.id === currentConversationId) return;
            loadMessages(conv.id);
            closeMobileSidebar();
        });

        conversationListEl.appendChild(item);
    });
    updateConversationItemsState();
}

function renderHistory() {
    chatBoxEl.innerHTML = '';
    history.forEach((msg, index) => {
        if (msg.role === 'user' && msg.parts[0].text === SYSTEM_INSTRUCTION) return;
        renderMessage(msg.role, msg.parts[0].text, false, msg.displayText, index);
    });
}

async function loadConversations(uid) {
    if (!uid) {
        clearHistoryList();
        return;
    }
    try {
        const snap = await db.collection('conversations')
            .where('userId', '==', uid)
            .orderBy('updatedAt', 'desc')
            .get();
        const conversations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderConversationList(conversations);
        if (!currentConversationId && conversations.length) {
            loadMessages(conversations[0].id);
        }
    } catch (e) {
        console.error('載入對話列表失敗', e);
        setAuthHint('載入對話列表失敗，請稍後再試', true);
    }
}

async function findUnusedNewChat(uid) {
    if (!uid) return null;
    try {
        const snap = await db.collection('conversations')
            .where('userId', '==', uid)
            .where('title', '==', 'New chat')
            .limit(1)
            .get();

        if (snap.empty) return null;

        const doc = snap.docs[0];
        const messagesSnap = await doc.ref.collection('messages').limit(1).get();
        if (!messagesSnap.empty) return null;

        return doc.id;
    } catch (e) {
        console.warn('查詢未使用的對話失敗', e);
        return null;
    }
}

async function createConversation(title = 'New chat') {
    const user = auth.currentUser;
    if (!user) {
        setAuthHint('請先登入再建立對話', true);
        return null;
    }
    try {
        if (title === 'New chat') {
            const existingDraftId = await findUnusedNewChat(user.uid);
            if (existingDraftId) {
                currentConversationId = existingDraftId;
                await loadMessages(existingDraftId);
                setAuthHint('為了厚道，有效率的壓榨資本家資源，請先使用已建立的New chat');
                return existingDraftId;
            }
        }

        if (isCreatingConversation) {
            setAuthHint('正在建立對話，請稍候');
            return currentConversationId;
        }
        isCreatingConversation = true;

        const doc = await db.collection('conversations').add({
            userId: user.uid,
            title,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        currentConversationId = doc.id;
        history = [];
        renderHistory();
        await loadConversations(user.uid);
        return doc.id;
    } catch (e) {
        console.error('建立對話失敗', e);
        setAuthHint('建立對話失敗，請稍後再試', true);
        return null;
    } finally {
        isCreatingConversation = false;
    }
}

async function handleNewChat() {
    if (!currentUser) {
        setAuthHint('請先登入再建立對話', true);
        return;
    }
    if (isConversationActionLocked()) {
        notifyConversationActionLocked('建立新對話');
        return;
    }
    await createConversation('New chat');
}

async function loadMessages(convId) {
    if (!convId) return;
    const user = auth.currentUser;
    if (!user) {
        setAuthHint('請先登入再讀取對話', true);
        return;
    }
    try {
        const snap = await db.collection('conversations')
            .doc(convId)
            .collection('messages')
            .orderBy('ts', 'asc')
            .get();
        history = snap.docs.map(d => {
            const data = d.data();
            const content = data.content || '';
            const displayText = data.displayContent || content;
            return { role: data.role, parts: [{ text: content }], displayText, messageId: d.id };
        });
        currentConversationId = convId;
        renderHistory();
        await loadConversations(user.uid);
    } catch (e) {
        console.error('載入訊息失敗', e);
        setAuthHint('載入訊息失敗，請稍後再試', true);
    }
}

async function addMessage(convId, role, content, displayContent = null) {
    if (!convId) return null;
    const user = auth.currentUser;
    if (!user) return null;
    try {
        const messagesRef = db.collection('conversations').doc(convId).collection('messages');
        const docRef = await messagesRef.add({
            role,
            content,
            displayContent: displayContent || content,
            userId: user.uid,
            ts: firebase.firestore.FieldValue.serverTimestamp(),
        });
        await db.collection('conversations').doc(convId).update({
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        return docRef.id;
    } catch (e) {
        console.error('寫入訊息失敗', e);
        return null;
    }
}

async function deleteConversation(convId) {
    if (!convId) return;
    const user = auth.currentUser;
    if (!user) {
        setAuthHint('請先登入再刪除對話', true);
        return;
    }

    const confirmed = window.confirm('確定要刪除這個對話嗎？此動作無法復原。');
    if (!confirmed) return;

    try {
        const convRef = db.collection('conversations').doc(convId);
        const convSnap = await convRef.get();
        const convData = convSnap.data();

        if (!convSnap.exists || convData?.userId !== user.uid) {
            setAuthHint('無法刪除此對話', true);
            return;
        }

        const messagesSnap = await convRef.collection('messages').get();
        const commits = [];
        const BATCH_LIMIT = 450;
        let batch = db.batch();
        let counter = 0;

        messagesSnap.forEach((msgDoc) => {
            batch.delete(msgDoc.ref);
            counter++;
            if (counter === BATCH_LIMIT) {
                commits.push(batch.commit());
                batch = db.batch();
                counter = 0;
            }
        });
        if (counter > 0) {
            commits.push(batch.commit());
        }
        await Promise.all(commits);

        await convRef.delete();

        if (currentConversationId === convId) {
            currentConversationId = null;
            history = [];
            clearChatUI();
        }

        await loadConversations(user.uid);
        setAuthHint('對話已刪除');
    } catch (e) {
        console.error('刪除對話失敗', e);
        setAuthHint('刪除對話失敗，請稍後再試', true);
    }
}

async function deleteMessagesByIds(convId, messageIds = []) {
    if (!convId || !Array.isArray(messageIds) || !messageIds.length) return;
    const user = auth.currentUser;
    if (!user) return;
    try {
        const messagesRef = db.collection('conversations').doc(convId).collection('messages');
        const commits = [];
        const BATCH_LIMIT = 450;
        let batch = db.batch();
        let counter = 0;

        messageIds.forEach((id) => {
            if (!id) return;
            batch.delete(messagesRef.doc(id));
            counter++;
            if (counter === BATCH_LIMIT) {
                commits.push(batch.commit());
                batch = db.batch();
                counter = 0;
            }
        });

        if (counter > 0) {
            commits.push(batch.commit());
        }

        if (commits.length) {
            await Promise.all(commits);
        }
    } catch (e) {
        console.error('刪除訊息失敗', e);
    }
}

async function updateConversationTitleIfEmpty(convId, text) {
    if (!convId || !text) return;
    try {
        const docRef = db.collection('conversations').doc(convId);
        const doc = await docRef.get();
        const data = doc.data() || {};
        if (!data.title || data.title === 'New chat') {
            const title = text.slice(0, 40);
            await docRef.set({ title }, { merge: true });
        }
    } catch (e) {
        console.warn('更新標題失敗', e);
    }
}

async function handleSignIn() {
    const email = authEmailEl.value.trim();
    const password = authPasswordEl.value.trim();
    if (!email || !password) {
        setAuthHint('請輸入 email 與密碼', true);
        return;
    }
    try {
        await auth.signInWithEmailAndPassword(email, password);
        setAuthHint('登入成功');
        clearAuthFields();
        closeMobileSidebar();
    } catch (e) {
        console.error(e);
        setAuthHint(e.message || '登入失敗', true);
    }
}

async function handleSignUp() {
    const email = authEmailEl.value.trim();
    const password = authPasswordEl.value.trim();
    if (!email || !password) {
        setAuthHint('請輸入 email 與密碼', true);
        return;
    }
    try {
        await auth.createUserWithEmailAndPassword(email, password);
        setAuthHint('註冊並登入成功');
        clearAuthFields();
        closeMobileSidebar();
    } catch (e) {
        console.error(e);
        setAuthHint(e.message || '註冊失敗', true);
    }
}

async function handleSignOut() {
    try {
        await auth.signOut();
        clearChatUI();
        clearHistoryList();
        currentConversationId = null;
        setEditingState(false);
        setAuthHint('已登出');
        clearAuthFields(true);
        closeMobileSidebar();
    } catch (e) {
        console.error(e);
        setAuthHint('登出失敗', true);
    }
}

auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    updateUserProfile(user);
    updateAuthUI(user);
    if (user) {
        setAuthHint(`已登入：${user.email}`);
        await loadConversations(user.uid);
        updateSendButtonState();
    } else {
        setAuthHint('未登入：對話不會被儲存');
        clearHistoryList();
        currentConversationId = null;
        closeMobileSidebar();
        updateSendButtonState();
    }
});

async function showCooldownCountdown(seconds, loadingId) {
    return new Promise((resolve) => {
        let remaining = seconds;
        const loadingEl = document.getElementById(loadingId);
        const contentEl = loadingEl?.querySelector('.text-content');
        const originalHtml = contentEl ? contentEl.innerHTML : '';

        console.log(`[COOLDOWN] 進入冷卻，總共 ${seconds} 秒`);

        const timer = setInterval(() => {
            if (contentEl) {
                contentEl.innerHTML = `<i>思想小助手回應中... (等待 ${remaining} 秒冷卻)</i>`;
            }
            console.log(`[COOLDOWN] 剩餘 ${remaining} 秒`);
            remaining--;

            if (remaining <= 0) {
                clearInterval(timer);
                if (contentEl) {
                    contentEl.innerHTML = originalHtml;
                }
                console.log(`[COOLDOWN] 冷卻結束，準備重試 API`);
                resolve();
            }
        }, 1000);
    });
}

async function callApiWithRetry(body, loadingId, maxRetries = 5) {
    let attempt = 0;
    while (attempt < maxRetries) {
        attempt++;
        console.log(`[API] 嘗試第 ${attempt} 次呼叫...`);

        try {
            const res = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (res.status === 503) {
                console.warn(`[API] 503 超載，第 ${attempt} 次 → 立即重試`);
                continue;
            }

            if (res.status === 429) {
                let retryAfter = parseInt(res.headers.get("Retry-After") || "0", 10);

                if (!retryAfter) {
                    const errData = await res.json().catch(() => ({}));
                    const msg = errData?.error?.message || "";
                    const match = msg.match(/retry in ([\d.]+)s/i);
                    if (match) retryAfter = Math.ceil(parseFloat(match[1]));
                }

                if (!retryAfter) retryAfter = 5 * attempt;

                console.warn(`[API] 429 配額超限 → 等待 ${retryAfter} 秒再重試 (第 ${attempt} 次)`);

                await showCooldownCountdown(retryAfter, loadingId);

                continue;
            }

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                console.error(`[API] 非 503/429 錯誤: ${res.status}`, err);
                throw new Error(err?.error?.message || `HTTP ${res.status}`);
            }

            console.log(`[API] 成功! 第 ${attempt} 次呼叫返回結果`);
            return await res.json();

        } catch (e) {
            console.error(`[API] 呼叫失敗 (第 ${attempt} 次):`, e);
            if (attempt >= maxRetries) throw e;
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    throw new Error("已達最大重試次數仍失敗");
}

async function sendMessage() {
    if (isAwaitingResponse) {
        return;
    }
    const text = inputEl.value.trim();
    if (!text) return;

    const toolContext = buildToolContextPayload();
    const composedText = toolContext
        ? `【工具資訊】\n${toolContext}\n\n【使用者提問】\n${text}`
        : text;

    if (currentUser && !currentConversationId) {
        const newId = await createConversation('New chat');
        if (!newId) return;
    }

    const activeConvId = currentConversationId;

    if (isEditingMessage) {
        setEditingState(false);
    }

    isAwaitingResponse = true;
    inputEl.value = "";
    inputEl.style.height = 'auto';
    updateSendButtonState();
    updateConversationLockUI();

    const userMsg = { role: "user", parts: [{ text: composedText }], displayText: text, messageId: null };
    history.push(userMsg);
    renderMessage("user", composedText, false, text, history.length - 1);

    const loadingId = showLoading();

    try {
        if (currentUser && activeConvId) {
            const userMsgId = await addMessage(activeConvId, "user", composedText, text);
            userMsg.messageId = userMsgId;
            await updateConversationTitleIfEmpty(activeConvId, text);
        }

        const payloadHistory = [
            { role: "user", parts: [{ text: SYSTEM_INSTRUCTION }] },
            ...history.map(msg => ({
                role: msg.role,
                parts: msg.parts
            }))
        ];

        const data = await callApiWithRetry({ contents: payloadHistory }, loadingId);
        removeLoading(loadingId);

        if (currentConversationId !== activeConvId) {
            return;
        }

        const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "API returned no content.";
        const modelMsg = { role: "model", parts: [{ text: responseText }], displayText: responseText, messageId: null };
        history.push(modelMsg);
        renderMessage("model", responseText, false, responseText, history.length - 1);
        if (currentUser && activeConvId) {
            const modelMsgId = await addMessage(activeConvId, "model", responseText, responseText);
            modelMsg.messageId = modelMsgId;
            await loadConversations(currentUser.uid);
        }
    } catch (e) {
        removeLoading(loadingId);
        if (currentConversationId === activeConvId) {
            renderMessage("model", `Error: ${e.message}`, true);
        }
        console.error(e);
    } finally {
        isAwaitingResponse = false;
        updateSendButtonState();
        updateConversationLockUI();
        if (window.innerWidth > 768 && currentConversationId === activeConvId) {
            inputEl.focus();
        }
    }
}

sendButtonEl.addEventListener("click", sendMessage);

inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

inputEl.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    updateSendButtonState();
});

document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI(currentUser);
    renderHistory();
    initCopyHandler(chatBoxEl);
    renderPromptTools();
    if (loginBtn) loginBtn.addEventListener('click', handleSignIn);
    if (signupBtn) signupBtn.addEventListener('click', handleSignUp);
    if (logoutBtn) logoutBtn.addEventListener('click', handleSignOut);
    if (newChatBtn) newChatBtn.addEventListener('click', handleNewChat);
    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', () => toggleMobileSidebar());
    if (mobileBackdrop) mobileBackdrop.addEventListener('click', closeMobileSidebar);
    updateSendButtonState();
    updateConversationLockUI();
});
