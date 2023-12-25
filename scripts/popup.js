let loginButton = document.getElementById("loginButton");

loginButton.addEventListener("click", () => {
    playSound();
    chrome.identity.getAuthToken({ interactive: true }, function (token) {

    });
});


const playSound = () => {
    let url = chrome.runtime.getURL('audio.html');
    url += '?volume=0.5&src=assets/audio/call.mp3&length=20000';

    chrome.tabs.create({
        url: url,
    })

}