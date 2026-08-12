(function () {
  "use strict";

  var core = window.GNewsCore;
  var tiles = Array.prototype.slice.call(document.querySelectorAll(".tile"));
  var grid = document.getElementById("grid");
  var playback = document.getElementById("playback");
  var spinner = document.getElementById("spinner");
  var error = document.getElementById("error");
  var video = document.getElementById("video");
  var focusedIndex = 0;
  var session = 0;
  var failureTimer = null;

  function setFocusedIndex(nextIndex) {
    focusedIndex = nextIndex;
    tiles.forEach(function (tile, index) {
      tile.classList.toggle("is-focused", index === focusedIndex);
      tile.setAttribute("tabindex", index === focusedIndex ? "0" : "-1");
    });
    tiles[focusedIndex].focus();
  }

  function clearFailureTimer() {
    if (failureTimer !== null) {
      window.clearTimeout(failureTimer);
      failureTimer = null;
    }
  }

  function stopVideo() {
    clearFailureTimer();
    try {
      video.pause();
    } catch (ignored) {}
    video.removeAttribute("src");
    try {
      video.load();
    } catch (ignored) {}
    playback.classList.remove("is-playing");
  }

  function showUnavailable(activeSession) {
    if (activeSession !== session || playback.hidden) return;
    stopVideo();
    spinner.hidden = true;
    error.hidden = false;
  }

  function showGrid() {
    session += 1;
    stopVideo();
    playback.hidden = true;
    grid.hidden = false;
    spinner.hidden = false;
    error.hidden = true;
    window.setTimeout(function () {
      setFocusedIndex(focusedIndex);
    }, 0);
  }

  function beginPlayback(index) {
    var tile = tiles[index];
    var channel = core.findChannel(tile.getAttribute("data-channel"));
    var activeSession = session + 1;
    session = activeSession;
    focusedIndex = index;
    stopVideo();
    grid.hidden = true;
    playback.hidden = false;
    spinner.hidden = false;
    error.hidden = true;

    failureTimer = window.setTimeout(function () {
      showUnavailable(activeSession);
    }, 25000);

    core.resolveChannel(channel, window.fetch.bind(window), { timeoutMs: 10000 }).then(
      function (streamUrl) {
        if (activeSession !== session || playback.hidden) return;
        video.src = streamUrl;
        video.autoplay = true;
        video.controls = false;
        video.load();
        var playResult = video.play();
        if (playResult && typeof playResult.catch === "function") {
          playResult.catch(function () {
            showUnavailable(activeSession);
          });
        }
      },
      function () {
        showUnavailable(activeSession);
      }
    );
  }

  function handlePlaying() {
    if (playback.hidden) return;
    clearFailureTimer();
    spinner.hidden = true;
    error.hidden = true;
    playback.classList.add("is-playing");
  }

  function handleKeyDown(event) {
    var keyCode = event.keyCode || event.which;
    if (!playback.hidden) {
      if (keyCode === core.KEYS.BACK) {
        event.preventDefault();
        event.stopPropagation();
        showGrid();
      }
      return;
    }

    if (
      keyCode === core.KEYS.LEFT ||
      keyCode === core.KEYS.RIGHT ||
      keyCode === core.KEYS.UP ||
      keyCode === core.KEYS.DOWN
    ) {
      event.preventDefault();
      setFocusedIndex(core.moveFocus(focusedIndex, keyCode));
      return;
    }

    if (keyCode === core.KEYS.ENTER) {
      event.preventDefault();
      beginPlayback(focusedIndex);
      return;
    }

    if (keyCode === core.KEYS.BACK) {
      window.close();
    }
  }

  tiles.forEach(function (tile, index) {
    tile.addEventListener("focus", function () {
      setFocusedIndex(index);
    });
    tile.addEventListener("click", function () {
      beginPlayback(index);
    });
  });

  video.addEventListener("playing", handlePlaying);
  video.addEventListener("error", function () {
    showUnavailable(session);
  });
  window.addEventListener("keydown", handleKeyDown, true);
  window.addEventListener("unload", stopVideo);
  setFocusedIndex(0);
})();
