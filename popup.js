const addOauth = () => {
    chrome.identity.getAuthToken({ 'interactive': true }, function (token) {
      console.log(token)
    });
  }


  document.querySelector('button').addEventListener('click', function () {
    chrome.identity.getAuthToken({ 'interactive': true }, function (token) {
      // chrome.identity.launchWebAuthFlow({
      //   'url': 'https://accounts.google.com/o/oauth2/auth?client_id=137332974021-tqu2121q32nb1cvqehs1fuc2lttenllk.apps.googleusercontent.com&redirect_uri=https://lookcw.github.io&scope=https://www.googleapis.com/auth/calendar.readonly&response_type=token',

      //   'interactive': true,
      
      // }, function(redirectUrl) {
      //   // Handle the callback after user authorizes or denies
      //   console.log(redirectUrl);
      // });
      console.log(token)
    }); 
    console.log("button clicked")
  });


  function onSignIn(googleUser) {
    var profile = googleUser.getBasicProfile();
    console.log('ID: ' + profile.getId()); // Do not send to your backend! Use an ID token instead.
    console.log('Name: ' + profile.getName());
    console.log('Image URL: ' + profile.getImageUrl());
    console.log('Email: ' + profile.getEmail()); // This is null if the 'email' scope is not present.
  }