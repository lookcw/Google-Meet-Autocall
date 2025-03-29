const MEET_ALARM_PREFIX = "meeting-alarm:";
const ADD_UPCOMING_ALARMS_ALARM_NAME = "add-upcoming-alarms";
const ALARM_ENABLED_KEY = 'alarmEnabled';
const MINUTES_BEFORE_KEY = 'minutesBefore';
const DEFAULT_MINUTES_BEFORE = 0;

const ZOOM_URL_REGEX = /https:\/\/[a-zA-Z0-9.-]+\.zoom\.us\/j\/\d+/;
const TEAMS_URL_REGEX = /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s"<>]+/;

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
      clearAllAlarms();
    } else {
      setUpcomingAlarms();
    }
  } else if (message.type === 'minutesBeforeChanged') {
    chrome.storage.sync.set({ [MINUTES_BEFORE_KEY]: message.minutesBefore });
    clearAllAlarms();
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

const clearAllAlarms = () => {
  chrome.alarms.getAll(alarms => {
    alarms.forEach(alarm => {
      if (alarm.name.startsWith(MEET_ALARM_PREFIX)) {
        chrome.alarms.clear(alarm.name);
      }
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
  if (event?.conferenceData?.conferenceSolution?.name === 'Zoom Meeting') {
    return true;
  }
  const match = event.description?.match(ZOOM_URL_REGEX);
  return match ? match[0] : null;
}

const isEventAGoogleMeeting = (event) => {
  return 'hangoutLink' in event
}

const isEventATeamsMeeting = (event) => {
  return event.description?.includes('teams.microsoft.com/l/meetup-join');
}


const isEventAfterNow = (event) => {
  return new Date(event.start.dateTime) > new Date()
}

const getZoomMeetingUrl = (event) => {
  let zoomUrl;
  
  // First try conference data method
  if (event?.conferenceData?.conferenceSolution?.name === 'Zoom Meeting') {
    const entryPoints = event.conferenceData.entryPoints;
    zoomUrl = entryPoints.find(entryPoint => entryPoint.entryPointType === 'video')?.uri;
  }

  // Fall back to description URL
  if (!zoomUrl) {
    const match = event.description?.match(ZOOM_URL_REGEX);
    zoomUrl = match ? match[0] : null;
  }

  // Convert https:// Zoom URL to zoommtg:// protocol
  if (zoomUrl) {
    return zoomUrl.replace(
      /https:\/\/([a-zA-Z0-9.-]+)\.zoom\.us\/j\/(\d+)(\?pwd=([a-zA-Z0-9]+))?/,
      (match, domain, meetingId, _, password) => {
        if (password) {
          return `zoommtg://${domain}.zoom.us/join?action=join&confno=${meetingId}&pwd=${password}`;
        }
        return `zoommtg://${domain}.zoom.us/join?action=join&confno=${meetingId}`;
      }
    );
  }
  
  return null;
}

const getGoogleMeetingUrl = (event) => {
  return event.hangoutLink
}

const getTeamsMeetingUrl = (event) => {
  const match = event.description?.match(TEAMS_URL_REGEX);
  return match ? match[0] : null;
}

const isEventAccepted = (event, selfEmail) => {
  const isConferenceAndAccepted = event.attendees && event.attendees.some(attendee => attendee.email === selfEmail && attendee.responseStatus !== 'declined')
  return event.status === 'confirmed' && (!event.attendees || isConferenceAndAccepted)
}

const getTimeAndMeetingUrl = (event) => {
  return 'start' in event && isEventAMeeting(event) ?
    {
      time: event.start.dateTime,
      url: isEventAZoomMeeting(event) 
        ? getZoomMeetingUrl(event) 
        : isEventATeamsMeeting(event)
        ? getTeamsMeetingUrl(event)
        : getGoogleMeetingUrl(event),
    }
    :
    {}
}

const createAlarmsFromCalendarEvents = async (events, email) => {
  const { minutesBefore = DEFAULT_MINUTES_BEFORE } = await chrome.storage.sync.get('minutesBefore');
  const msOffset = minutesBefore * 60 * 1000;
  const upcomingMeetingEvents = events.items.filter(isEventAMeeting).filter(isEventAfterNow);
  const acceptedMeetings = upcomingMeetingEvents
    .filter(event => isEventAccepted(event, email))
    .map(getTimeAndMeetingUrl);
    
  for (const meeting of acceptedMeetings) {
    if (!meeting.url) continue;
    const alarmName = MEET_ALARM_PREFIX + meeting.url;
    const meetingTime = new Date(meeting.time);
    const alarmTime = new Date(meetingTime.getTime() - msOffset);
    try {
      const alarm = await chrome.alarms.get(alarmName);
      if (!alarm) {
        await chrome.alarms.create(alarmName, { when: alarmTime.getTime() });
      }
    } catch (error) {
      console.error('Error creating alarm:', error);
    }
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

const keepAlive = () => setInterval(chrome.runtime.getPlatformInfo, 20e3);
chrome.runtime.onStartup.addListener(keepAlive);
keepAlive();