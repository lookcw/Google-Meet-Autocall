const MEET_ALARM_PREFIX = "meet-alarm:";
const ADD_UPCOMING_ALARMS_ALARM_NAME = "add-upcoming-alarms";

chrome.alarms.create(ADD_UPCOMING_ALARMS_ALARM_NAME, { periodInMinutes: 5 });


chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith(MEET_ALARM_PREFIX)) {
    const meetUrl = alarm.name.substring(MEET_ALARM_PREFIX.length);
    chrome.tabs.create({ url: meetUrl });
    openRingToneUrl();
  }
  else if (alarm.name === ADD_UPCOMING_ALARMS_ALARM_NAME) {
    setUpcomingAlarms();
  }
}
);


const setUpcomingAlarms = () => {
  chrome.identity.getAuthToken({ 'interactive': true }, function (token) {
    chrome.identity.getProfileUserInfo(function (info) {
    if (!info.email) {
      alert("please enable sync in google chrome!")
    }
      const calendarRequestUrl = getEventListRequestUrl(info.email, getCalendarEventListParams());
      fetch(calendarRequestUrl, getFetchHeaders(token))
        .then((response) => {console.log(response);return response.json()})
        .then(function (eventData) {
          console.log(eventData)
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

const isEventAMeeting = (event) => {
  return 'hangoutLink' in event
}

const isEventBeforeNow = (event) => {
  return new Date(event.start.dateTime) > new Date()
}

const isEventAccepted = (event, selfEmail) => {
  console.log("ahh")
  console.log(event.attendees)
  console.log(event.attendees.some(attendee => attendee.email === selfEmail && attendee.responseStatus !== 'declined'))
  console.log(selfEmail)
  const isConferenceAndAccepted = event.attendees && event.attendees.some(attendee => attendee.email === selfEmail && attendee.responseStatus !== 'declined')
  console.log(isConferenceAndAccepted)
  return event.status === 'confirmed' && (!event.attendees || isConferenceAndAccepted)
}

const getTimeAndMeetingUrl = (event) => {
  return 'start' in event && 'hangoutLink' in event ?
    {
      time: event.start.dateTime,
      url: event.hangoutLink
    }
    :
    {}
}


const createAlarmsFromCalendarEvents = (events, email) => {
  const upcomingMeetingEvents = events.items.filter(isEventAMeeting).filter(isEventBeforeNow)
  const acceptedMeetings = upcomingMeetingEvents.filter(event => isEventAccepted(event, email)).map(getTimeAndMeetingUrl)
  for (const meeting of acceptedMeetings) {
    const alarmName = MEET_ALARM_PREFIX + meeting.url;
    const alarmTime = new Date(meeting.time);
    chrome.alarms.get(alarmName).then((alarm) => {
      if (!alarm) {
      chrome.alarms.create(alarmName, { when: alarmTime.getTime() });
      console.log("alarm for " + alarmName + " created at " + alarmTime)
      }
    });
  }
  const declinedMeetings = upcomingMeetingEvents.filter(event => !isEventAccepted(event, email)).map(getTimeAndMeetingUrl)
  for (const meeting of declinedMeetings) {
    const alarmName = MEET_ALARM_PREFIX + meeting.url;
    chrome.alarms.clear(alarmName);
    console.log("alarm for " + alarmName + " cleared")
  }
}

const openRingToneUrl = () => {
    let url = chrome.runtime.getURL('audio.html');
    url += '?volume=0.5&src=assets/audio/call.mp3&length=20000';
    chrome.tabs.create({
        url: url,
    })

}

setUpcomingAlarms();