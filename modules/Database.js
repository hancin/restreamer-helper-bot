const sqlite = require('sqlite');

const dbPromise = Promise.resolve()
    .then(() => sqlite.open('./data/db.sqlite', { Promise }))
    .then(db => db.migrate({}));

exports.channelList = async () => {
    const db = await dbPromise;
    const channelInfo = await db.all('SELECT * FROM ChannelInfo');

    return channelInfo;
};

exports.channelGet = async (pk) => {
    const db = await dbPromise;
    const channelInfo = db.get('SELECT * FROM ChannelInfo WHERE channel = ?', pk);

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
