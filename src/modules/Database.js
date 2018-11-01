const sqlite = require('sqlite');

const dbPromise = Promise.resolve()
    .then(() => sqlite.open('./data/db.sqlite', { Promise }))
    .then(db => db.migrate({}));


exports.scheduledIntervalList = async (pk) => {
    const db = await dbPromise;
    const channelInfo = await db.all('SELECT * FROM ScheduleInterval');

    return channelInfo;
}
exports.scheduledIntervalGet = async (pk) => {
    const db = await dbPromise;
    const channelInfo = await db.get('SELECT * FROM ScheduleInterval WHERE messageId = ?', pk);

    return channelInfo;
}
exports.scheduledIntervalRemove = async (pk) => {
    const db = await dbPromise;
    await db.run('DELETE FROM ScheduleInterval WHERE messageId = ?', pk);
}

exports.scheduledIntervalPut = async (pk, data) => {
    const db = await dbPromise;

    await db.run(`REPLACE INTO ScheduleInterval(messageId,
        guild,
        channelName,
        created,
        updated,
        requester,
        requesterMessageId,
        commandsArgs) VALUES(?,?,?,?,?,?,?,?)`, 
        pk, 
        data.guild,
        data.channelName,
        data.created, 
        data.updated,
        data.requester,
        data.requesterMessageId,
        data.commandsArgs);
};
exports.scheduledIntervalNew = () => {
    return {
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        messageId: "",
        guild: "",
        channelName: "",
        requester: "",
        requesterMessageId: "",
        commandsArgs: ""
    }
}


exports.channelList = async () => {
    const db = await dbPromise;
    const channelInfo = await db.all('SELECT * FROM ChannelInfo');

    return channelInfo;
};

exports.channelGet = async (pk) => {
    const db = await dbPromise;
    const channelInfo = await db.get('SELECT * FROM ChannelInfo WHERE channel = ?', pk);

    return channelInfo;
};

exports.channelPut = async (pk, data) => {
    const db = await dbPromise;

    await db.run(`REPLACE INTO ChannelInfo(channel,
        created,
        updated,
        nightbotId,
        nightbotAccessToken,
        nightbotRefreshToken,
        nightbotExpiresAt,
        twitchId,
        twitchAccessToken,
        twitchRefreshToken,
        twitchExpiresAt) VALUES(?,?,?,?,?,?,?,?,?,?,?)`, 
        pk, 
        data.created, 
        data.updated,
        data.nightbotId,
        data.nightbotAccessToken,
        data.nightbotRefreshToken,
        data.nightbotExpiresAt,
        data.twitchId,
        data.twitchAccessToken,
        data.twitchRefreshToken,
        data.twitchExpiresAt);
};

exports.channelNew = () => {
    return {
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        nightbotId: "",
        nightbotAccessToken: "",
        nightbotRefreshToken: "",
        nightbotExpiresAt: new Date().toISOString(),
        twitchId: "",
        twitchAccessToken: "",
        twitchRefreshToken: "",
        twitchExpiresAt: new Date().toISOString()
    }
}
