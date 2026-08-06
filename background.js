chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "CHECK_LOGIN") {
    chrome.cookies.get(
      { url: "https://www.instagram.com/", name: "sessionid" },
      (cookie) => {
        sendResponse({ loggedIn: !!cookie });
      }
    );
    return true;
  }
});
