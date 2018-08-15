/* global SpaceFox */

let lastSession = Date.now() / 1000;
var gSpaceFox = SpaceFox;

let newWindow = win => {
  // get window and recreate spacefox
  SpaceFox.getWindowValue(win.id)
    .then(name => {
      if (name) {
        let space = new SpaceFox(win, name);
        SpaceFox.info("restored space " + space.name);
      }
    })
    .catch(SpaceFox.onError);
};

browser.windows.onCreated.addListener(newWindow);

// disable for private window (for firefox, set in manifest for chrome)
browser.tabs.onCreated.addListener(tab => {
  if (tab.incognito) {
    // firefox bug - need to delay
    setTimeout(() => browser.browserAction.disable(tab.id), 500);
  }
});

browser.windows.onRemoved.addListener(windowId => {
  // note - the window does not contain any tabs at this point
  var space = SpaceFox.getByWindowId(windowId);
  if (space) space.close();

  browser.sessions.getRecentlyClosed({ maxResults: 10 }).then(sessionInfos => {
    // (chrome ignores maxResults)
    let sessions = sessionInfos.filter(el => el.window && el.lastModified > lastSession);
    if (!sessions.length) {
      // chrome does not create a window for the session unless it conains at least two tabs
      sessions = sessionInfos.filter(el => el.lastModified > lastSession);
      // console.log("spacefox/recent-tab");
    }
    let sess = sessions[0];
    if (sess) {
      lastSession = sess.lastModified;
      // console.log("sess", lastSession, sess);
      let tabs = sess.window ? sess.window.tabs : [sess.tab];
      if (space) space.saveSpace(tabs);
    }
  });
});

browser.runtime.onMessage.addListener(message => {
  switch (message.command) {
    case "openSpace":
      SpaceFox.openSpace(message.name);
      break;
    case "split":
      onSplit(message.tabs);
      break;
  }
});

let onSplit = moveTabs => {
  browser.windows
    .create({ type: "normal" })
    .then(newWin => {
      browser.tabs.query({ windowId: newWin.id }).then(newTabs => {
        browser.tabs
          .move(moveTabs, { windowId: newWin.id, index: 0 })
          .then(moved => browser.tabs.remove(newTabs.map(tab => tab.id)));
      });
    })
    .catch(SpaceFox.onError);
};

// restore all spacefox spaces (if the extension is reloaded)
browser.windows.getAll({ populate: true, windowTypes: ["normal"] }).then(windows => {
  for (let win of windows) {
    newWindow(win);
  }
});
