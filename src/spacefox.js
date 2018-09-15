/* global generateName */

let BOOKMARK_ROOT_NAME = "SpaceFox-Spaces";
let useWindowValue = !!browser.sessions.getWindowValue; // not supported by chrome
let altWindowValues = {};
let isFirefox = browser.runtime.getBrowserInfo;

if (browser.runtime.getBrowserInfo)
  browser.runtime.getBrowserInfo().then(info => {
    isFirefox = info.name === "Firefox";
  });

class SpaceFox {
  constructor(win, name) {
    this.windowId = win.id;
    this.setName(name);
    SpaceFox.spaces.push(this);
  }

  setName(name) {
    // resolve conflicts
    while (!name || (SpaceFox.getByName(name) && this.name !== name)) {
      if (name) SpaceFox.info(`name conflict with ${name}`);
      name = generateName();
    }
    this.name = name;
    SpaceFox.setBadge(this.windowId, name);
    SpaceFox.setWindowValue(this.windowId, this.name).catch(SpaceFox.onError);
  }

  close() {
    var idx = SpaceFox.getIndexByName(this.name);
    if (idx >= 0) SpaceFox.spaces.splice(idx, 1);
    SpaceFox.info(`close ${this.name} [open=${SpaceFox.spaces.length}]`);
  }

  remove() {
    this.close();
    SpaceFox.setBadge(this.windowId, "");
    SpaceFox.setWindowValue(this.windowId, "").catch(SpaceFox.onError);
  }

  static info(msg) {
    console.log("spacefox/" + msg);
  }

  static onError(error) {
    console.error("spacefox/error", error);
  }

  static setWindowValue(windowId, value) {
    if (useWindowValue) {
      return browser.sessions.setWindowValue(windowId, "spacefox-name", value);
    } else {
      altWindowValues[windowId] = value;
      return browser.storage.local.set({ winval: altWindowValues });
    }
  }
  static getWindowValue(windowId) {
    if (useWindowValue) {
      return browser.sessions.getWindowValue(windowId, "spacefox-name");
    } else {
      return Promise.resolve(altWindowValues[windowId]);
    }
  }
  static setBadge(windowId, text) {
    if (text && text.length > 3) text = text.substring(0, 3);
    if (isFirefox) {
      // for now this is only supported by firefox
      browser.browserAction.setBadgeText({
        text: text,
        windowId: windowId,
      });
      browser.browserAction.setBadgeBackgroundColor({
        color: "#0000cc",
        windowId: windowId,
      });
      browser.browserAction.setTitle({
        title: text + " - SpaceFox",
        windowId: windowId,
      });
    }
  }

  static getByName(name) {
    return SpaceFox.spaces.find(el => el.name === name);
  }
  static getByWindowId(windowId) {
    return SpaceFox.spaces.find(el => el.windowId === windowId);
  }
  static getIndexByName(name) {
    return SpaceFox.spaces.findIndex(el => el.name === name);
  }

  static _getBMFolder(parentId, title, create) {
    return browser.bookmarks
      .getChildren(parentId)
      .then(children => children.find(bm => bm.title == title), e => null)
      .then(bm => {
        if (!bm && create) bm = browser.bookmarks.create({ parentId: parentId, title: title });
        return bm;
      })
      .catch(SpaceFox.onError);
  }

  static getRootBm() {
    return browser.bookmarks
      .search({ title: BOOKMARK_ROOT_NAME })
      .then(list => list.find(bm => bm.type === "folder" || !bm.url))
      .then(root => root || browser.bookmarks.create({ title: BOOKMARK_ROOT_NAME }))
      .catch(SpaceFox.onError);
  }
  static getSpaceBmList() {
    return SpaceFox.getRootBm().then(root => browser.bookmarks.getChildren(root.id));
  }
  static getSpaceBmByName(name) {
    return SpaceFox.getSpaceBmList().then(list => list.find(bm => bm.title === name));
  }

  static getSpaceBMFolder(name, create = true) {
    return SpaceFox.getRootBm().then(root => SpaceFox._getBMFolder(root.id, name, create));
  }
  static getTabBmList(name) {
    return SpaceFox.getSpaceBMFolder(name, false).then(folder => browser.bookmarks.getChildren(folder.id));
  }

  static getSpaceList() {
    return SpaceFox.getSpaceBmList().then(list =>
      list.map(el => {
        return { name: el.title, isActive: SpaceFox.getByName(el.title) };
      })
    );
  }

  static _includeUrl(url) {
    const protocol = new URL(url).protocol;
    return SpaceFox.safeProtocols.includes(protocol);
  }

  saveSpace(tablist = null) {
    tablist = tablist ? Promise.resolve(tablist) : browser.tabs.query({ windowId: this.windowId });
    tablist
      .then(tabs => tabs.filter(tab => SpaceFox._includeUrl(tab.url)))
      .then(tabs => SpaceFox._saveTabs(this.name, tabs))
      .then(res => SpaceFox.info(`${this.name} saved (${res.length})`))
      .catch(SpaceFox.onError);
  }

  static removeBMFolder(name, allowRecovery = false) {
    let first = allowRecovery
      ? SpaceFox.getTabBmList(name).then(list => SpaceFox.recover.push({ name: name, tabs: list }))
      : Promise.resolve();
    return first.then(() => SpaceFox.getSpaceBMFolder(name, false)).then(folder => {
      if (folder) return browser.bookmarks.removeTree(folder.id);
    });
  }

  static recoverLast() {
    let rec = SpaceFox.recover.pop();
    return SpaceFox._saveTabs(rec.name, rec.tabs);
  }

  static _saveTabs(name, tabs) {
    return SpaceFox.removeBMFolder(name)
      .then(() => SpaceFox.getSpaceBMFolder(name))
      .then(folder =>
        tabs.reverse().map(async tab => {
          return await browser.bookmarks.create({
            index: 0,
            parentId: folder.id,
            title: tab.title,
            url: tab.url,
          });
        })
      );
  }

  static openSpace(name) {
    let space = SpaceFox.getByName(name);
    if (space) {
      browser.windows.update(space.windowId, { focused: true });
      return;
    }

    SpaceFox.getTabBmList(name)
      .then(list => {
        let urls = list.map(bm => bm.url);
        browser.windows.create({ type: "normal" }).then(win => {
          space = new SpaceFox(win, name);
          SpaceFox.info(`open space ${space.name} [open=${SpaceFox.spaces.length}]`);
          return browser.tabs.query({ windowId: win.id }).then(async newTabs => {
            for (let url of urls) await browser.tabs.create({ url: url, windowId: win.id });
            if (urls.length) return browser.tabs.remove(newTabs.map(tab => tab.id));
          });
        });
      })
      .catch(SpaceFox.onError);
    // browser.tabs.discard(win.tabs.map(tab => tab.id));
  }
}

SpaceFox.spaces = [];
SpaceFox.recover = [];
SpaceFox.safeProtocols = ["http:", "https:", "ftp:"];

if (!useWindowValue) {
  browser.storage.local.get(["winval"]).then(val => {
    altWindowValues = val["winval"] || {};
  });
  // clear old
  browser.runtime.onStartup.addListener(() => browser.storage.local.set({ winval: {} }));
}
