const zgquotesAppendix = readStaticTextSync("/static/md/張國語錄文字版.md");

if (typeof window !== 'undefined') {
    window.ZG_QUOTES_APPENDIX = zgquotesAppendix;
}
