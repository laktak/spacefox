let backgroundPage = browser.extension.getBackgroundPage();
let SpaceFox;
if (!backgroundPage) {
  // action should normally be disabled
  document.querySelector("body").innerHTML = "(Disabled in private browsing.)";
} else SpaceFox = backgroundPage.gSpaceFox;

var win, space, spaces, moveTabs;
var spacesDiv = document.querySelector(".spaces");
var activeDiv = document.querySelector(".active");
var recoverA = document.querySelector("#recover");

let mkDiv = (className, child = null) => {
  let d = document.createElement("div");
  d.className = className;
  if (child) d.appendChild(child);
  return d;
};

let mkText = text => document.createTextNode(text);

let mkIcon = name => {
  let el = document.createElement("i");
  el.className = "fas fa-" + name;
  return el;
};

let mkA = (id, child, className = "") => {
  let a = document.createElement("a");
  a.setAttribute("id", id);
  a.href = "#";
  a.className = className;
  a.appendChild(child);
  return a;
};

// get current space
browser.windows.getCurrent().then(fwin => {
  win = fwin;
  space = SpaceFox.getByWindowId(win.id);
  if (space) {
    activeDiv.className += " active-space";
    activeDiv.appendChild(mkDiv("", mkText(space.name)));
    activeDiv.appendChild(mkA("more", mkIcon("ellipsis-h")));
  } else {
    activeDiv.innerHTML = '<a id="new" href="#">Save</a> this Window to a New Space';
  }
  // add spaces
  SpaceFox.getSpaceList()
    .then(list => {
      spaces = list.reverse();
      if (space) spaces = spaces.filter(el => el.name !== space.name);
      spaces.sort((a, b) => a.name.localeCompare(b.name));
      spaces.forEach(addSpace);
    })
    .catch(SpaceFox.onError);
});

if (!SpaceFox.recover.length) recoverA.style.display = "none";

function addSpace(space) {
  let d = mkDiv("space", mkA(space.name, mkText(space.name)));
  if (!space.isActive) d.appendChild(mkA("view-" + space.name, mkIcon("search-plus"), "space-cmd"));
  else d.className += " space-loaded";
  spacesDiv.appendChild(d);
}

function rename() {
  activeDiv.innerHTML = '<input type="text"><a id="rename" href="#">Save</a><a id="remove" href="#">Remove</a>';
  let txt = document.querySelector(".active input");
  txt.value = space.name;
  txt.focus();
  txt.setSelectionRange(0, txt.value.length);
  txt.addEventListener("keydown", event => {
    if (event.key === "Enter") onRename();
  });
}

function onRename() {
  let txt = document.querySelector(".active input");
  SpaceFox.removeBMFolder(space.name).then(() => {
    space.setName(txt.value);
    space.saveSpace();
    window.close();
  });
}

function onRemove() {
  SpaceFox.removeBMFolder(space.name).then(() => {
    space.remove();
    window.close();
  });
}

function onUnload() {
  browser.tabs
    .query({ windowId: win.id })
    .then(tabs => tabs.map(tab => tab.id))
    .then(tabs => browser.tabs.discard(tabs))
    .then(() => window.close())
    .catch(SpaceFox.onError);
}

function onRecover() {
  SpaceFox.recoverLast().then(() => window.close());
}

function onSpace(tid) {
  let kill = tid.indexOf("kill-") === 0;
  let view = tid.indexOf("view-") === 0;
  if (kill || view) tid = tid.substr(5);
  let space = spaces.find(el => el.name === tid);
  if (space) {
    if (kill) {
      let s = SpaceFox.getByName(space.name);
      if (s) s.remove();
      SpaceFox.removeBMFolder(space.name, !s);
    } else if (view) {
      return onView(space);
    } else {
      browser.runtime.sendMessage({ command: "openSpace", name: space.name });
    }
    window.close();
  }
}

function reset(name) {
  let secs = ["main", "split", "space-view"];
  for (let sec of secs) {
    let s = document.querySelector("." + sec);
    s.style.display = name === sec ? "block" : "none";
  }
}

function onView(space) {
  reset("space-view");
  let viewDiv = document.querySelector(".space-view");
  viewDiv.innerHTML = "";
  let title = mkDiv("title", mkA("close-view", mkIcon("arrow-circle-left")));
  title.appendChild(mkText(space.name));
  viewDiv.appendChild(title);
  SpaceFox.getTabBmList(space.name)
    .then(list => {
      list.forEach(tab => {
        viewDiv.appendChild(mkDiv("tab", mkText(tab.title)));
      });
    })
    .then(() => {
      let cmd = mkDiv("tools buttons");
      cmd.appendChild(mkA(space.name, mkText("Open")));
      cmd.appendChild(mkA("kill-" + space.name, mkText("Delete")));
      viewDiv.appendChild(cmd);
    })
    .catch(SpaceFox.onError);
}

function onSplit() {
  reset("split");
  let splitDiv = document.querySelector(".split");
  browser.tabs
    .query({ windowId: win.id })
    .then(tabs => {
      let cuidx = tabs.findIndex(tab => tab.active);
      let move = tabs.filter((tab, idx) => idx >= cuidx);
      moveTabs = move.map(tab => tab.id);
      move.forEach(tab => {
        splitDiv.appendChild(mkDiv("tab", mkText(tab.title)));
      });
    })
    .catch(SpaceFox.onError);
}

function onSplitConfirm() {
  browser.runtime.sendMessage({ command: "split", tabs: moveTabs }).then(() => window.close());
}

document.addEventListener("click", e => {
  let tid = e.target.id || e.target.parentNode.id;
  switch (tid) {
    case "cancel":
      window.close();
      break;
    case "new":
    case "more":
      if (!space) {
        space = new SpaceFox(win);
        activeDiv.className += " active-space";
      }
      rename();
      break;
    case "help":
      browser.tabs.create({ url: "https://github.com/laktak/spacefox" });
      window.close();
      break;
    case "split":
      onSplit();
      break;
    case "split2":
      onSplitConfirm();
      break;
    case "close-view":
      reset("main");
      break;
    case "rename":
      onRename();
      break;
    case "unload":
      onUnload();
      break;
    case "remove":
      onRemove();
      break;
    case "recover":
      onRecover();
      break;
    default:
      onSpace(tid);
      break;
  }
});
