const fetch = require('node-fetch');
module.exports = (client) => {
    
    async function sendSGRequest(url, options = {}){
        const mergedOptions = Object.assign({},{}, options);

        let response = await fetch(client.config.speedgaming.api + url, mergedOptions);
        let content = await response.json();

        return {response: response, content: content};
    }

    function parsePlayer(entry){
        let runner = {
            approved: entry.approved || false,
            name: entry.displayName,
            stream: entry.publicStream,
            discord: entry.discordTag
        }

        if(runner.stream === '')
            runner.stream = entry.displayName;

        return runner;
    }

    function processEpisode(episode){

        let res = Object.assign({
            channelName: '',
            channelText: '',
            primaryChannel: {}}, episode);

        res.commentatorCount = episode.commentators.length;
        res.allCommentators = episode.commentators.map(parsePlayer);
        res.commentators = episode.commentators.filter(x=>x.approved).map(parsePlayer);

        res.trackerCount = episode.trackers.length;
        res.allTrackers = episode.trackers.map(parsePlayer);
        res.trackers = episode.trackers.filter(x=>x.approved).map(parsePlayer);

        res.broadcasterCount = episode.broadcasters.length;
        res.allBroadcasters = episode.broadcasters.map(parsePlayer);
        res.broadcasters = episode.broadcasters.filter(x=>x.approved).map(parsePlayer);

        let allPlayers = [];
        let playerNames = "";

        if(episode.match1 && episode.match1.players){
            res.match1.players = episode.match1.players.map(parsePlayer);
            playerNames = res.match1.players.map(x=> x.name).join(" vs ");
            allPlayers.push(...res.match1.players);
        }
        if(episode.match2 && episode.match2.players){
            res.match2.players = episode.match2.players.map(parsePlayers);
            playerNames += ", " +res.match2.players.map(x=> x.name).join(" vs ");
            allPlayers.push(...res.match2.players);
        }


        res.crews = [
            {name:"Commentators",
            variable: "commentators",
            variable2: "commentatorNames",
            value: res.commentators, 
            allValues: res.allCommentators,
            count: res.commentatorCount,
            hasEnough: res.commentators.length >= 2,
            streamText: res.commentators.map(x=> "twitch.tv/" + x.stream).join(" & "),
            nameText: res.commentators.map(x=> x.name).join(" & ")
            },
            {name:"Trackers", 
            variable: "trackers",
            variable2: "trackerNames",
            value: res.trackers, 
            allValues: res.allTrackers,
            count: res.trackerCount,
            hasEnough: allPlayers.length > 2 ? res.trackers.length >= 2: res.trackers.length >= 1,
            streamText: res.trackers.map(x=> "twitch.tv/" + x.stream).join(" & "),
            nameText: res.trackers.map(x=> x.name).join(" & ")},
            {name:"Restreamers", 
            variable: "restreamers",
            variable2: "restreamerNames",
            value: res.broadcasters,
            allValues: res.allBroadcasters,
            count: res.broadcasterCount,
            streamText: res.broadcasters.map(x=> "twitch.tv/" + x.stream).join(" & "),
            nameText: res.broadcasters.map(x=> x.name).join(" & ")}
        ];

        res.variations = episode.match1 && episode.match1.title? episode.match1.title : "";
        
        let ignore = ['Undecided, Not SG', 'No Restream'];

        if(res.channels){
            res.channels = res.channels.filter(x=>!ignore.some(i => i.toLowerCase() === x.name.toLowerCase()));
        }

        if(res.channels && res.channels.length > 0){
            let primaryChannel = res.channels.find(x=>x.name.match(/^(speedgaming\d*|alttprandomizer\d*)$/gi));
            res.channelName = primaryChannel ? primaryChannel.name : res.channels[0].name;
            res.primaryChannel = primaryChannel;
            res.showAssigned = primaryChannel && true;
            res.needsBroadcasters = !primaryChannel || primaryChannel.name.match(/^alttprandomizer\d*$/gi);
            let chan = res.channels.map(x=> `[${x.name}](https://twitch.tv/${x.name})`);
            chan.sort();
            res.channelText = chan.join(', ');
        }else{
            res.needsBroadcasters = true;
            res.showAssigned = false;
        }

        if(res.needsBroadcasters){
            res.crews[2].hasEnough = res.crews[2].value.length >= 1;
        }else{
            res.crews[2].hasEnough = true;
        }

        res.fullyStaffed = res.crews.every(x=>x.hasEnough);

        res.playerInfo = {
            "name": "Players",
            variable: "players",
            variable2: "playerNames",
            value: allPlayers,
            streamText: allPlayers.map(x=> "twitch.tv/" + x.stream).join(" & "),
            nameText: playerNames
        }

        return res;

    }

    return {
        list: async (from, to, event) => {
            let episodes = await sendSGRequest(`/schedule?from=${from}&to=${to}&event=${event}`)
    
            if(!episodes.content || episodes.content.error){
                client.logger.debug("Error while retrieving episodes:"+ episodes.content.error);
                return [];
            }
    
            let filtered = episodes.content.filter(m=>m.approved);
    
            for(var i=0;i<filtered.length;i++){
                filtered[i] = processEpisode(filtered[i]);
            }

            return filtered;
        },
        get: async(id) => {
            let episode = await sendSGRequest(`/episode?id=${id}`);
    
            if(!episode.content || episode.content.error){
                client.logger.debug("Error while retrieving episode:"+ episode.content.error);
                return null;
            }
    
            return processEpisode(episode.content);
    
        },
        isPrimaryChannel: /^(speedgaming\d*|alttprandomizer\d*)$/gi,
        filterSgMatches: (episodes) => {
            return episodes.filter(m=> m.channels && m.channels.some(c=>c.name.toLowerCase().indexOf('speedgaming') !== -1));
        },
        filterAlttprMatches: (episodes) => {
            return episodes.filter(m=> m.channels && m.channels.some(c=>c.name.toLowerCase().indexOf('alttprandomizer') !== -1));
        },
        filteredDisplayedMatches: (episodes) => {
            return episodes.filter(m=> m.channels && m.channels.some(c=>c.name.toLowerCase().indexOf('alttprandomizer') !== -1 || c.name.toLowerCase().indexOf('speedgaming') !== -1));
        }, 
        filterOtherMatches: (episodes) => {
            return episodes.filter(m=> !m.channels || m.channels.length === 0 || (m.channels && m.channels.some(c=>c.name.toLowerCase().indexOf('alttprandomizer') === -1 && c.name.toLowerCase().indexOf('speedgaming') === -1)));
        }
    
    }

}