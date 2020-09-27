import ICommandArguments from "../../../Commands/Arguments";
import Command from "../../../Commands/Command";

enum DBCommandType {
    get = "get",
    all = "all",
    run = "run"
}

export default class AdminSQL extends Command {
    name = "SQL";
    command = [ "sql", "SQL" ];

    description = "";

    async run({ message, database }: ICommandArguments) {
        let type = message.arguments.shift();
        let stmt = message.arguments.join(" ");
        let res: any | any[];

        switch (type) {
            case DBCommandType.get:
                res = await database.get(stmt);
                break;
            case DBCommandType.all:
                res = await database.get(stmt);
                break;
            case DBCommandType.run:
                res = await database.get(stmt);
                break;
        }

        return message.reply(JSON.stringify(res));
    }
}