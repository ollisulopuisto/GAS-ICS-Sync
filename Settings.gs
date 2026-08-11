/*
*=========================================
*            SETTINGS STORAGE
*=========================================
*
* The settings written at the top of Code.gs are the defaults. The settings page
* (see the "Settings GUI" section of the README) stores your own values with
* PropertiesService instead, so you don't have to edit the script to change them
* and your personal settings are not part of the code.
*
* Stored settings win over the values in Code.gs. Anything you never set in the
* settings page keeps using the value from Code.gs.
*/

// The single source of truth for the settings page and for loading stored settings.
// "key" must match the name of the variable in Code.gs that holds the setting.
var SETTING_DEFINITIONS = [
  { key : "sourceCalendars", type : "calendars", group : "Calendars",
    label : "Source calendars", description : "The ics/ical feeds to sync and the Google Calendar each one syncs to." },

  { key : "howFrequent", type : "number", group : "Syncing",
    label : "Sync interval (minutes)", description : "Rounded up to 5, 10, 15, 30 or a whole number of hours. 1440 is the maximum." },
  { key : "addEventsToCalendar", type : "boolean", group : "Syncing",
    label : "Add new events", description : "Turn off to check the log without writing anything to your calendar." },
  { key : "modifyExistingEvents", type : "boolean", group : "Syncing",
    label : "Update changed events", description : "Turn off to keep your own changes to synced events instead of following the feed." },
  { key : "removeEventsFromCalendar", type : "boolean", group : "Syncing",
    label : "Remove events that left the feed", description : "Only events created by this script are ever removed." },
  { key : "removePastEventsFromCalendar", type : "boolean", group : "Syncing",
    label : "Also remove past events", description : "Turn off to keep events that have already taken place." },
  { key : "syncPastDays", type : "nullableNumber", group : "Syncing",
    label : "Sync events that ended within (days)", description : "Leave empty for no limit. 0 syncs only events that have not ended yet." },
  { key : "syncFutureDays", type : "nullableNumber", group : "Syncing",
    label : "Sync events starting within (days)", description : "Leave empty for no limit." },
  { key : "addTasks", type : "boolean", group : "Syncing",
    label : "Sync tasks (VTODO)", description : "Adds the feed's tasks to your first Google Tasks list." },

  { key : "wipeTitles", type : "boolean", group : "Privacy",
    label : "Replace event titles", description : "Hides what the events are, e.g. when syncing to a calendar other people can see." },
  { key : "genericTitle", type : "string", group : "Privacy",
    label : "Replacement title", description : "The title every event gets when titles are replaced." },
  { key : "wipeDescriptions", type : "boolean", group : "Privacy",
    label : "Clear event descriptions", description : "" },
  { key : "wipeLocations", type : "boolean", group : "Privacy",
    label : "Clear event locations", description : "" },
  { key : "overrideVisibility", type : "select", group : "Privacy", options : ["", "default", "public", "private", "confidential"],
    label : "Force event visibility", description : "Leave empty to use the visibility set in the feed." },

  { key : "addAlerts", type : "select", group : "Appearance", options : ["yes", "no", "default"],
    label : "Event notifications", description : "\"yes\" uses the feed's alarms, \"default\" uses your calendar's default reminders, \"no\" adds none." },
  { key : "defaultAllDayReminder", type : "number", group : "Appearance",
    label : "All-day event reminder (minutes before)", description : "-1 for no reminder. Otherwise between 0 and 40320." },
  { key : "addOrganizerToTitle", type : "boolean", group : "Appearance",
    label : "Put the organiser in the title", description : "" },
  { key : "addCalToTitle", type : "boolean", group : "Appearance",
    label : "Put the source calendar in the title", description : "" },
  { key : "descriptionAsTitles", type : "boolean", group : "Appearance",
    label : "Use descriptions as titles", description : "" },
  { key : "addAttendees", type : "boolean", group : "Appearance",
    label : "Copy the attendee list", description : "Careful: attendees get the event added to their own calendar." },

  { key : "emailSummary", type : "boolean", group : "Email",
    label : "Email a summary of changes", description : "Needs an email address below." },
  { key : "email", type : "string", group : "Email",
    label : "Email address", description : "Also used for the \"new version available\" notice." },
  { key : "customEmailSubject", type : "string", group : "Email",
    label : "Custom email subject", description : "Leave empty for the default subject." },
  { key : "dateFormat", type : "select", group : "Email",
    options : ["YYYY-MM-DD", "DD-MM-YYYY", "MM-DD-YYYY", "YYYY/MM/DD", "DD/MM/YYYY", "MM/DD/YYYY", "YYYY.MM.DD", "DD.MM.YYYY", "MM.DD.YYYY"],
    label : "Date format in the email", description : "" }
];

var SETTINGS_PROPERTY = "settings";

/**
 * Returns the default value of a setting, i.e. the value written in Code.gs.
 *
 * @param {string} key - The name of the setting
 * @return {*} The default value
 */
function getSettingDefault(key){
  return globalThis[key];
}

/**
 * Reads the raw stored settings.
 *
 * @return {Object} The stored settings, an empty object if nothing was stored yet
 */
function getStoredSettings(){
  var raw = PropertiesService.getUserProperties().getProperty(SETTINGS_PROPERTY);
  if (!raw)
    return {};

  try{
    return JSON.parse(raw) || {};
  }
  catch (e){
    Logger.log("[WARNING] Stored settings could not be read, using the script defaults: " + e);
    return {};
  }
}

/**
 * Converts one stored value to the type the script expects.
 * Invalid values fall back to the default from Code.gs.
 *
 * @param {Object} definition - The definition of the setting
 * @param {*} value - The stored value
 * @return {*} The value to use
 */
function coerceSetting(definition, value){
  var fallback = getSettingDefault(definition.key);

  switch (definition.type){
    case "boolean":
      if (value === true || value === "true" || value === "on" || value === 1)
        return true;
      if (value === false || value === "false" || value === "off" || value === 0 || value === "")
        return false;
      return fallback;

    case "number":
      var num = Number(value);
      return (value === "" || value == null || isNaN(num)) ? fallback : num;

    case "nullableNumber":
      if (value === "" || value == null)
        return null;
      var optional = Number(value);
      return isNaN(optional) ? fallback : optional;

    case "select":
      return definition.options.indexOf(value) > -1 ? value : fallback;

    case "calendars":
      return normalizeSourceCalendars(value, fallback);

    default: //string
      return value == null ? fallback : String(value);
  }
}

/**
 * Converts the source calendar rows of the settings page into the format the
 * script uses: [url, targetCalendarName, colorId, privacy].
 *
 * @param {Array} rows - The stored rows
 * @param {Array} fallback - The value to use if the rows can't be read
 * @return {Array.Array} The source calendar map
 */
function normalizeSourceCalendars(rows, fallback){
  if (!Array.isArray(rows))
    return fallback;

  var result = [];
  for (var row of rows){
    // Accept both the object form used by the settings page and the plain array form
    var url = Array.isArray(row) ? row[0] : row.url;
    var target = Array.isArray(row) ? row[1] : row.target;
    var color = Array.isArray(row) ? row[2] : row.color;
    var privacy = Array.isArray(row) ? row[3] : row.privacy;

    if (!url || !target)
      continue; //Incomplete row, e.g. one the user started and left empty

    if (color === "" || color == null)
      color = undefined;

    if (privacy === "" || privacy == null)
      privacy = undefined;
    else if (privacy === "true" || privacy === true)
      privacy = true;
    else if (privacy === "false" || privacy === false)
      privacy = false;

    result.push([String(url).trim(), String(target).trim(), color, privacy]);
  }

  return result;
}

/**
 * Returns the settings to use: the defaults from Code.gs with the stored settings applied on top.
 *
 * @return {Object} All settings by name
 */
function resolveSettings(){
  var stored = getStoredSettings();
  var settings = {};

  for (var definition of SETTING_DEFINITIONS){
    settings[definition.key] = (definition.key in stored)
      ? coerceSetting(definition, stored[definition.key])
      : getSettingDefault(definition.key);
  }

  return settings;
}

/**
 * Applies the resolved settings to the script variables of the same name, so the
 * rest of the script keeps reading plain variables.
 *
 * @param {?Object} settings - The settings to apply, resolved from storage if omitted
 * @return {Object} The applied settings
 */
function applySettings(settings){
  settings = settings || resolveSettings();

  sourceCalendars = settings.sourceCalendars;

  howFrequent = settings.howFrequent;
  addEventsToCalendar = settings.addEventsToCalendar;
  modifyExistingEvents = settings.modifyExistingEvents;
  removeEventsFromCalendar = settings.removeEventsFromCalendar;
  removePastEventsFromCalendar = settings.removePastEventsFromCalendar;
  syncPastDays = settings.syncPastDays;
  syncFutureDays = settings.syncFutureDays;
  addTasks = settings.addTasks;

  wipeTitles = settings.wipeTitles;
  genericTitle = settings.genericTitle;
  wipeDescriptions = settings.wipeDescriptions;
  wipeLocations = settings.wipeLocations;
  overrideVisibility = settings.overrideVisibility;

  addAlerts = settings.addAlerts;
  defaultAllDayReminder = settings.defaultAllDayReminder;
  addOrganizerToTitle = settings.addOrganizerToTitle;
  addCalToTitle = settings.addCalToTitle;
  descriptionAsTitles = settings.descriptionAsTitles;
  addAttendees = settings.addAttendees;

  emailSummary = settings.emailSummary;
  email = settings.email;
  customEmailSubject = settings.customEmailSubject;
  dateFormat = settings.dateFormat;

  return settings;
}

/**
 * Stores the provided settings. Unknown keys are ignored.
 *
 * @param {Object} values - The settings to store
 * @return {Object} The settings as they will be used from now on
 */
function saveSettings(values){
  values = values || {};
  var toStore = {};

  for (var definition of SETTING_DEFINITIONS){
    if (definition.key in values)
      toStore[definition.key] = values[definition.key];
  }

  PropertiesService.getUserProperties().setProperty(SETTINGS_PROPERTY, JSON.stringify(toStore));
  Logger.log("Settings saved");

  return resolveSettings();
}

/**
 * Forgets the stored settings, so the values written in Code.gs are used again.
 *
 * @return {Object} The settings as they will be used from now on
 */
function resetSettings(){
  PropertiesService.getUserProperties().deleteProperty(SETTINGS_PROPERTY);
  Logger.log("Settings reset to the values in the script");

  return resolveSettings();
}

/*
*=========================================
*             SETTINGS PAGE
*=========================================
*/

/**
 * Serves the settings page. Deploy the script as a web app ("Deploy" > "New deployment"
 * > "Web app", execute as yourself, access "Only myself") and open the deployment URL.
 */
function doGet(){
  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("GAS-ICS-Sync settings")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/**
 * The names of the calendars this account can write to, for the settings page to
 * offer as suggestions. A name that isn't in the list is still allowed: the script
 * creates a calendar with that name when it syncs.
 *
 * @return {Array.string} The calendar names, sorted and without duplicates
 */
function listWritableCalendarNames(){
  try{
    var names = listAllCalendars()
      .filter(function(cal){ return cal.accessRole == "owner" || cal.accessRole == "writer"; })
      .map(function(cal){ return (cal.summaryOverride || cal.summary || "").toString(); })
      .filter(function(name){ return name != ""; });

    return names
      .filter(function(name, index){ return names.indexOf(name) == index; })
      .sort(function(a, b){ return a.localeCompare(b); });
  }
  catch (e){
    // The settings page still works without the suggestions, so don't fail over this
    Logger.log("[WARNING] Could not list the calendars of this account: " + e);
    return [];
  }
}

/**
 * The event colours Google Calendar accepts, for the settings page to offer.
 *
 * @return {Array.Object} The colours as {id, label}, ordered by id
 */
function getEventColorOptions(){
  return Object.keys(CalendarApp.EventColor).map(function(name){
    var label = name.toLowerCase().replace(/_/g, " ");
    return {
      id : CalendarApp.EventColor[name].toString(),
      label : label.charAt(0).toUpperCase() + label.slice(1)
    };
  }).sort(function(a, b){ return Number(a.id) - Number(b.id); });
}

/**
 * Provides the settings page with everything it needs to render the form.
 *
 * @return {Object} The definitions, the current values and whether stored settings exist
 */
function getSettingsForUi(){
  var settings = resolveSettings();

  return {
    definitions : SETTING_DEFINITIONS.map(function(definition){
      return {
        key : definition.key,
        type : definition.type,
        group : definition.group,
        label : definition.label,
        description : definition.description,
        options : definition.options || null,
        scriptDefault : getSettingDefault(definition.key)
      };
    }),
    values : settings,
    calendarNames : listWritableCalendarNames(),
    eventColors : getEventColorOptions(),
    usingStoredSettings : Object.keys(getStoredSettings()).length > 0,
    triggerInstalled : hasSyncTrigger()
  };
}

/**
 * Saves the settings sent by the settings page.
 *
 * @param {Object} values - The settings to store
 * @return {Object} The state for the settings page to render
 */
function saveSettingsFromUi(values){
  saveSettings(values);
  return getSettingsForUi();
}

/**
 * Forgets the stored settings on behalf of the settings page.
 *
 * @return {Object} The state for the settings page to render
 */
function resetSettingsFromUi(){
  resetSettings();
  return getSettingsForUi();
}

/**
 * Whether the repeating sync trigger is currently installed.
 *
 * @return {boolean} True if a trigger for startSync exists
 */
function hasSyncTrigger(){
  return ScriptApp.getProjectTriggers().some(function(trigger){
    return trigger.getHandlerFunction() == "startSync";
  });
}

/**
 * Runs a sync in the background on behalf of the settings page, so the page
 * doesn't have to wait for the whole sync to finish.
 */
function runSyncNowFromUi(){
  ScriptApp.newTrigger("startSync").timeBased().after(1000).create();
  return "Sync started. It runs in the background, check the executions list for the log.";
}

/**
 * Installs the repeating trigger on behalf of the settings page.
 */
function installFromUi(){
  install();
  return "Automatic syncing is on.";
}

/**
 * Removes all triggers on behalf of the settings page.
 */
function uninstallFromUi(){
  uninstall();
  return "Automatic syncing is off.";
}
