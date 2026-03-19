function animateTypewriter(element, text, speed = 30) {
  if (!element) return;
  element.textContent = '';
  let i = 0;
  const timer = setInterval(() => {
    if (!element.isConnected) {
      clearInterval(timer);
      return;
    }
    if (i < text.length) {
      element.textContent += text.charAt(i);
      i++;
    } else {
      clearInterval(timer);
    }
  }, speed);
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function getBase64Size(base64String) {
  const padding = (base64String.match(/=/g) || []).length;
  return (base64String.length * 3) / 4 - padding;
}
