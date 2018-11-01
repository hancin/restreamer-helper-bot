-- Up
CREATE TABLE ScheduleInterval(
    messageId TEXT PRIMARY KEY, 
    guild TEXT,
    channelName TEXT, 
    created TEXT,
    updated TEXT,
    requester TEXT,
    requesterMessageId TEXT,
    commandsArgs TEXT
    );

-- Down
DROP TABLE ScheduleInterval;