const auth = firebase.auth();

const emailInput = document.getElementById('login-email');
const passwordInput = document.getElementById('login-password');
const submitBtn = document.getElementById('login-submit');
const statusEl = document.getElementById('login-status');

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.style.color = isError ? '#ef4444' : '#b4b4b4';
}

async function handleAuth() {
  const email = (emailInput?.value || '').trim();
  const password = (passwordInput?.value || '').trim();

  if (!email || !password) {
    setStatus('請輸入 email 與密碼', true);
    return;
  }

  submitBtn.disabled = true;
  setStatus('處理中，請稍候...');

  try {
    await auth.createUserWithEmailAndPassword(email, password);
    setStatus('註冊並登入成功，正在導向...');
    window.location.href = 'index.html';
  } catch (signupError) {
    console.warn('Signup failed, fallback to login.', signupError);
    try {
      await auth.signInWithEmailAndPassword(email, password);
      setStatus('登入成功，正在導向...');
      window.location.href = 'index.html';
    } catch (loginError) {
      console.error('Login failed.', loginError);
      setStatus('電子郵件或密碼錯誤', true);
    }
  } finally {
    submitBtn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (submitBtn) {
    submitBtn.addEventListener('click', handleAuth);
  }

  [emailInput, passwordInput].forEach((el) => {
    el?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleAuth();
      }
    });
  });
});
