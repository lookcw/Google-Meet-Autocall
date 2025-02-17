const MEET_ALARM_PREFIX = "meet-alarm:";
const ADD_UPCOMING_ALARMS_ALARM_NAME = "add-upcoming-alarms";
const ALARM_ENABLED_KEY = 'alarmEnabled';
const DEFAULT_MINUTES_BEFORE = 0;

chrome.alarms.create(ADD_UPCOMING_ALARMS_ALARM_NAME, { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const { alarmEnabled = true } = await chrome.storage.sync.get(ALARM_ENABLED_KEY);
  
  if (!alarmEnabled) return;

  if (alarm.name.startsWith(MEET_ALARM_PREFIX)) {
    const meetUrl = alarm.name.substring(MEET_ALARM_PREFIX.length);
    chrome.tabs.create({ url: meetUrl });
    openRingToneUrl();
  }
  else if (alarm.name === ADD_UPCOMING_ALARMS_ALARM_NAME) {
    setUpcomingAlarms();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'toggleAlarms') {
    chrome.storage.sync.set({ [ALARM_ENABLED_KEY]: message.enabled });
    if (!message.enabled) {
      chrome.alarms.getAll(alarms => {
        alarms.forEach(alarm => {
          if (alarm.name.startsWith(MEET_ALARM_PREFIX)) {
            chrome.alarms.clear(alarm.name);
          }
        });
      });
    } else {
      setUpcomingAlarms();
    }
  } else if (message.type === 'minutesBeforeChanged') {
    chrome.alarms.getAll(alarms => {
      alarms.forEach(alarm => {
        if (alarm.name.startsWith(MEET_ALARM_PREFIX)) {
          chrome.alarms.clear(alarm.name);
        }
      });
    });
    setUpcomingAlarms();
  }
});

const setUpcomingAlarms = () => {
  chrome.identity.getAuthToken({ 'interactive': true }, function (token) {
    chrome.identity.getProfileUserInfo(function (info) {
    if (!info.email) {
      alert("please enable sync in google chrome!")
    }
      const calendarRequestUrl = getEventListRequestUrl(info.email, getCalendarEventListParams());
      fetch(calendarRequestUrl, getFetchHeaders(token))
        .then((response) => {return response.json()})
        .then(function (eventData) {
          createAlarmsFromCalendarEvents(eventData, info.email.toLowerCase())
        });
    });
  });
}

const getFetchHeaders = (token) => {
  return {
    method: 'GET',
    async: true,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    'contentType': 'json'
  };
}

const getCalendarEventListParams = () => {
  let tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  return {
    'timeMin': new Date().toISOString(),
    'timeMax': tomorrow.toISOString(),
    'orderBy': 'startTime',
    'singleEvents': true
  }
}

const getEventListRequestUrl = (calendarId, params) => {
  return `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`
    + '?'
    + new URLSearchParams(params).toString();
}

const isEventAZoomMeeting = (event) => {
  return event?.conferenceData?.conferenceSolution?.name === 'Zoom Meeting'
}

const isEventAMeeting = (event) => {
  return 'hangoutLink' in event || isEventAZoomMeeting(event)
}

const isEventAfterNow = (event) => {
  return new Date(event.start.dateTime) > new Date()
}

const getZoomMeetingUrl = (event) => {
  const entryPoints = event.conferenceData.entryPoints
  return entryPoints.find(entryPoint => entryPoint.entryPointType === 'video')?.uri
}

const getGoogleMeetingUrl = (event) => {
  return event.hangoutLink
}

const isEventAccepted = (event, selfEmail) => {
  const isConferenceAndAccepted = event.attendees && event.attendees.some(attendee => attendee.email === selfEmail && attendee.responseStatus !== 'declined')
  return event.status === 'confirmed' && (!event.attendees || isConferenceAndAccepted)
}

const getTimeAndMeetingUrl = (event) => {
  return 'start' in event && (isEventAMeeting(event) || isEventAZoomMeeting(event)) ?
    {
      time: event.start.dateTime,
      url: isEventAZoomMeeting(event) ? getZoomMeetingUrl(event) : getGoogleMeetingUrl(event)
    }
    :
    {}
}

const createAlarmsFromCalendarEvents = async (events, email) => {
  const { minutesBefore = DEFAULT_MINUTES_BEFORE } = await chrome.storage.sync.get('minutesBefore');
  const msOffset = minutesBefore * 60 * 1000; // Convert minutes to milliseconds

  const upcomingMeetingEvents = events.items.filter(isEventAMeeting).filter(isEventAfterNow);
  const acceptedMeetings = upcomingMeetingEvents
    .filter(event => isEventAccepted(event, email))
    .map(getTimeAndMeetingUrl);

  for (const meeting of acceptedMeetings) {
    if (!meeting.url) continue;
    
    const alarmPrefix = meeting.type === 'zoom' ? ZOOM_ALARM_PREFIX : MEET_ALARM_PREFIX;
    const alarmName = alarmPrefix + meeting.url;
    const meetingTime = new Date(meeting.time);
    const alarmTime = new Date(meetingTime.getTime() - msOffset);
    
    chrome.alarms.get(alarmName).then((alarm) => {
      if (!alarm) {
        chrome.alarms.create(alarmName, { when: alarmTime.getTime() });
      }
    });
  }

  const declinedMeetings = upcomingMeetingEvents.filter(event => !isEventAccepted(event, email)).map(getTimeAndMeetingUrl)
  for (const meeting of declinedMeetings) {
    const alarmName = MEET_ALARM_PREFIX + meeting.url;
    chrome.alarms.clear(alarmName);
  }
}

const openRingToneUrl = () => {
    let url = chrome.runtime.getURL('audio.html');
    url += '?volume=0.5&src=assets/audio/call.mp3&length=20000';
    chrome.tabs.create({
        url: url,
    })

}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ 
    alarmEnabled: true,
    minutesBefore: DEFAULT_MINUTES_BEFORE
  });
});

setUpcomingAlarms();