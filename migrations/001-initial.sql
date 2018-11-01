-- Up
CREATE TABLE ChannelInfo(
    channel TEXT PRIMARY KEY, 
    created TEXT, 
    updated TEXT,
    nightbotId TEXT,
    nightbotAccessToken TEXT,
    nightbotRefreshToken TEXT,
    nightbotExpiresAt TEXT,
    twitchId TEXT,
    twitchAccessToken TEXT,
    twitchRefreshToken TEXT,
    twitchExpiresAt TEXT
    );

-- Down
DROP TABLE ChannelInfo;