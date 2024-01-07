const addOauth = () => {
    chrome.identity.getAuthToken({ 'interactive': true }, function (toke) {
      console.log(token)
    });
    console.log("asdf2")
  }


  document.querySelector('button')
  .addEventListener('click', function () {
    chrome.runtime.sendMessage({ message: '' });
    console.log("button clicked")
  });
