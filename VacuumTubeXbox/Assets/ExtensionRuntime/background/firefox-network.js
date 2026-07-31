'use strict';

const YOUTUBE_UA = 'Mozilla/5.0 (PS4; Leanback Shell) Cobalt/19.lts.0-qa; compatible; VacuumTube-Titan/0.8.0';

browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const headers = [...(details.requestHeaders || [])];
    const header = headers.find((item) => item.name.toLowerCase() === 'user-agent');
    if (header) header.value = YOUTUBE_UA;
    else headers.push({ name: 'User-Agent', value: YOUTUBE_UA });
    return { requestHeaders: headers };
  },
  { urls: ['https://www.youtube.com/tv*'], types: ['main_frame'] },
  ['blocking', 'requestHeaders']
);
