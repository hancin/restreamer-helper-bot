-- Up
CREATE TABLE MatchNotes(
    id INTEGER PRIMARY KEY, 
    episodeId INTEGER,
    permLevel INTEGER,
    memberId TEXT, 
    created TEXT,
    updated TEXT,
    note TEXT
    );

-- Down
DROP TABLE MatchNotes;