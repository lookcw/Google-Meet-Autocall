function addUpcomingAlarms() {
  
    chrome.identity.getAuthToken({ 'interactive': true }, function ({grantedScopes, token}) {
      console.log(grantedScopes)
    });
    console.log("asdf2")
  }


