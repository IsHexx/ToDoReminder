function shouldRunAutoSync(settings, currentTime, localDate) {
    if (!settings || settings.autoSync === false) {
        return false;
    }

    if (!settings.syncTime || settings.syncTime !== currentTime) {
        return false;
    }

    return settings.lastAutoSyncDate !== localDate;
}

module.exports = {
    shouldRunAutoSync
};
