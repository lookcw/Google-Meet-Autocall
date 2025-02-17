const addOauth = () => {
  chrome.identity.getAuthToken({ 'interactive': true }, function (token) {
    console.log(token)
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const toggle = document.getElementById('alarmToggle');
  const minutesInput = document.getElementById('minutesBefore');
  
  // Load saved states
  const { 
    alarmEnabled = true,
    minutesBefore = 0 
  } = await chrome.storage.sync.get(['alarmEnabled', 'minutesBefore']);
  
  toggle.checked = alarmEnabled;
  minutesInput.value = minutesBefore;

  // Listen for changes to the toggle
  toggle.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    chrome.storage.sync.set({ alarmEnabled: enabled });
    chrome.runtime.sendMessage({
      type: 'toggleAlarms',
      enabled: enabled
    });
  });

  // Listen for changes to the minutes input
  minutesInput.addEventListener('change', (e) => {
    const minutes = Math.max(0, parseInt(e.target.value) || 0);
    chrome.storage.sync.set({ minutesBefore: minutes });
    chrome.runtime.sendMessage({
      type: 'minutesBeforeChanged',
      minutes: minutes
    });
  });
});


