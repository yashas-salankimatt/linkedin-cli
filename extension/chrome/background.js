chrome.action.onClicked.addListener(async () => {
  try {
    const cookies = await chrome.cookies.getAll({ domain: ".linkedin.com" });
    if (!cookies.length) {
      console.error("No LinkedIn cookies found. Sign in to linkedin.com first.");
      return;
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      cookies: cookies.map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        expirationDate: cookie.expirationDate
      }))
    };

    const url = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(payload, null, 2))}`;

    await chrome.downloads.download({
      url,
      filename: "linkedin-cookies.json",
      saveAs: true
    });
  } catch (error) {
    console.error("Failed to export LinkedIn cookies", error);
  }
});
