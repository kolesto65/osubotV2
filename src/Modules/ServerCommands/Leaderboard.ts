import Message from "../../Message";
import ServerCommand from "../../Commands/Server/ServerCommand";
import { IServerCommandArguments, parseArguments, Parsers, IArgumentsWithMods } from "../../Commands/Arguments";
import Bot from "../../Bot";
import { defaultArguments } from "../../Util";
import { IDBUser } from "../../Database";
import { LeaderboardTemplate } from "../../Templates";
import { ServerConnection } from "@prisma/client";
import { OsuAPIWithScores } from "../../API/Osu/OsuServerAPI";

export default class LeaderboardCommand extends ServerCommand<OsuAPIWithScores> {
    name = "Leaderboard";
    command = [ "leaderboard", "lb", "дуфвукищфкв", "ди" ];

    description = "";

    parseArguments(message: Message, bot: Bot): IServerCommandArguments<IArgumentsWithMods> {
        return {
            ...defaultArguments(message, bot),
            ...parseArguments(message.arguments, [
                Parsers.mods
            ])
        }
    }

    async run({
        message, args,
        mapAPI, chats,
        vk, privileges,
        database
    }: IServerCommandArguments<IArgumentsWithMods>) {
        if(!message.chatId)
            throw "Команду можно использовать только в беседах!";

        let mapId = chats.getChatMap(message.peerId);
        let map = await mapAPI.getBeatmap(mapId);

        let { profiles } = await vk.api.messages.getConversationMembers({
            peer_id: message.peerId
        });

        let users: ServerConnection[] = [];
        for(let profile of profiles) {
            let user = await database.serverConnection.findFirst({
                where: {
                    userId: profile.id
                }
            })
            if(user.id && !users.some(u => u.id == user.id))
                users.push(user);
        }

        let leaderboard = await this.api.getLeaderboard({
            beatmapId: mapId,
            users,
            mods: args.mods ?? 0
        });

        let scores = leaderboard.map(v => ({
            user: v.user,
            status: privileges.getStatus(v.user.id),
            score: args.mods ? v.scores.find(s => s.mods == args.mods) : v.scores[0]
        })).filter(v => v.score);

        let msg = LeaderboardTemplate(this.module, scores, map);

        message.reply(msg);
    }
}