const sqlite = require('sqlite');

const dbPromise = Promise.resolve()
    .then(() => sqlite.open('./data/db.sqlite', { Promise }))
    .then(db => db.migrate({}));


exports.matchNotesList = async (maxRank = 0) => {
    const db = await dbPromise;

    if(maxRank > 0){
        return await db.all('SELECT * FROM MatchNotes WHERE permLevel <= ?', maxRank);
    }

    return await db.all('SELECT * FROM MatchNotes WHERE permLevel <= 6');
};
exports.matchNotesPutEpisode = async(pk, data) => {
    const db = await dbPromise;

    const result = await db.run(`INSERT INTO MatchNotes(
        episodeId,
        permLevel,
        memberId, 
        created,
        updated,
        note) VALUES(?,?,?,?,?,?)`,
        data.episodeId,
        data.permLevel,
        data.memberId, 
        data.created,
        data.updated,
        data.note);

    console.log(result);
    return result;

};
exports.matchNotesNew = () => {
    return {
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        id: 0,
        permLevel: 10,
        memberId: 0,
        episodeId: 0,
        note: ""
    }
}


exports.matchNotesPut = async (pk, data) => {
    const db = await dbPromise;

    await db.run(`REPLACE INTO MatchNotes(
        id,
        episodeId,
        permLevel,
        memberId, 
        created,
        updated,
        note) VALUES(?,?,?,?,?,?,?)`, 
        pk, 
        data.episodeId,
        data.permLevel,
        data.memberId, 
        data.created,
        data.updated,
        data.note);

};

exports.matchNotesGetEpisode = async (pk) => {
    const db = await dbPromise;
    return await db.all('SELECT * FROM MatchNotes WHERE episodeId = ?', pk);
};

exports.matchNotesGet = async (pk) => {
    const db = await dbPromise;
    return await db.get('SELECT * FROM MatchNotes WHERE id = ?', pk);
}

exports.matchNotesRemove = async (pk) => {
    const db = await dbPromise;
    await db.run('DELETE FROM MatchNotes WHERE id = ?', pk);
}
exports.matchNotesRemoveEpisode = async (pk) => {
    const db = await dbPromise;
    await db.run('DELETE FROM MatchNotes WHERE episodeId = ?', pk);
}

exports.scheduledIntervalList = async () => {
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
        commandsArgs,
        expiresAt) VALUES(?,?,?,?,?,?,?,?,?)`, 
        pk, 
        data.guild,
        data.channelName,
        data.created, 
        data.updated,
        data.requester,
        data.requesterMessageId,
        data.commandsArgs,
        data.expiresAt);
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
