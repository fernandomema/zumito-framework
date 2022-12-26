import { SlashCommandBuilder } from "discord.js";
import { Module } from "./types/Module.js";
import { ApiResponse } from './definitions/ApiResponse.js';
import { baseModule } from "./baseModule/index.js";
import { TranslationManager } from "./TranslationManager.js";
import express from 'express';
import * as fs from 'fs';
import path from 'path';
import { Client } from "discord.js";
// import better-logging
import { betterLogging } from "better-logging";
betterLogging(console);
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import mongoose from "mongoose";
import cookieParser from 'cookie-parser';
import cors from 'cors';
import http from 'http';
import * as url from 'url';
import { CommandType } from "./types/CommandType.js";
/**
 * @class ZumitoFramework
 * @classdesc The main class of the framework.
 *
 * @property {FrameworkSettings} settings - The settings of the framework.
 * @property {Client} client - The client client instance.
 * @property {Collection<string, Module>} modules - The modules loaded in the framework.
 * @property {Collection<string, Command>} commands - The commands loaded in the framework.
 */
export class ZumitoFramework {
    client;
    settings;
    modules;
    commands;
    events;
    translations;
    routes;
    models;
    database;
    app;
    /**
     * @constructor
     * @description Creates a new instance of the framework.
     * @param {FrameworkSettings} settings - The settings of the framework.
     * @example new ZumitoFramework({
     *     prefix: '!',
     *     discordClientOptions: {
     *        token: 'token',
     *        clientId: 'clientId',
     *       intents: 0
     *    }
     * });
     * @public
     */
    constructor(settings, callback) {
        this.settings = settings;
        this.modules = new Map();
        this.commands = new Map();
        this.events = new Map();
        this.translations = new TranslationManager();
        this.models = new Map();
        if (settings.logLevel) {
            console.logLevel = settings.logLevel;
        }
        this.initialize().then(() => {
            if (callback)
                callback(this);
        }).catch(err => {
            console.error(err, err.message, err.stack, err.name);
        });
    }
    async initialize() {
        try {
            await mongoose.connect(this.settings.mongoQueryString);
        }
        catch (err) {
            console.error("[🗄️🔴] Database connection error:", err.message);
            process.exit(1);
        }
        finally {
            this.database = mongoose.connection;
            console.log('[🗄️🟢] Database connection successful');
        }
        this.initializeDiscordClient();
        this.startApiServer();
        await this.registerModules();
        await this.refreshSlashCommands();
    }
    startApiServer() {
        this.app = express();
        let port = process.env.PORT || '80';
        this.app.set('port', port);
        var server = http.createServer(this.app);
        server.listen(port);
        server.on('error', (err) => {
            console.log('[🌐🔴] Error starting API web server: ' + err);
        });
        server.on('listening', () => {
            console.log('[🌐🟢] API web server listening on port ' + port);
        });
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: false }));
        this.app.use(cookieParser());
        //this.app.use(express.static(path.join(__dirname, "public")));
        //To allow cross-origin requests
        this.app.use(cors());
        //Route Prefixes
        //this.app.use("/", indexRouter);
        //this.app.use("/api/", apiRouter);
        // throw 404 if URL not found
        this.app.all("*", function (req, res) {
            return ApiResponse.notFoundResponse(res, "Page not found");
        });
        this.app.use(function (err, req, res) {
            if (err.name === 'UnauthorizedError') {
                return ApiResponse.unauthorizedResponse(res, "Invalid token");
            }
        });
    }
    async registerModules() {
        let modulesFolder;
        if (fs.existsSync(`${process.cwd()}/modules`)) {
            modulesFolder = `${process.cwd()}/modules`;
        }
        else if (fs.existsSync(`${process.cwd()}/src/modules`)) {
            modulesFolder = `${process.cwd()}/src/modules`;
        }
        else
            return;
        const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
        await this.registerModule(__dirname, 'baseModule', baseModule);
        let files = fs.readdirSync(modulesFolder);
        for (let file of files) {
            await this.registerModule(modulesFolder, file);
        }
        this.models.forEach((modelDefinition, modelName) => {
            const schema = new mongoose.Schema(modelDefinition);
            this.models.set(modelName, mongoose.model(modelName, schema));
        });
    }
    async registerModule(modulesFolder, moduleName, module) {
        if (!module) {
            if (fs.existsSync(path.join(modulesFolder, moduleName, 'index.js'))) {
                module = await import('file://' + path.join(modulesFolder, moduleName, 'index.js'));
                module = Object.values(module)[0];
            }
            else if (fs.existsSync(path.join(modulesFolder, moduleName, 'index.ts'))) {
                module = await import('file://' + path.join(modulesFolder, moduleName, 'index.ts'));
                module = Object.values(module)[0];
            }
            else {
                module = Module;
            }
            ;
        }
        // Create module instance
        let moduleInstance;
        try {
            moduleInstance = new module(path.join(modulesFolder, moduleName), this);
            await moduleInstance.initialize();
            this.modules.set(moduleName || moduleInstance.constructor.name, moduleInstance);
        }
        catch (err) {
            console.error(`[📦🔴] Error loading module ${moduleName}: ${err.message}`);
            console.error(err.stack);
        }
        // Register module commands
        if (moduleInstance.getCommands()) {
            moduleInstance.getCommands().forEach((command) => {
                this.commands.set(command.name, command);
            });
        }
        this.commands = new Map([...this.commands, ...moduleInstance.getCommands()]);
        // Register module events
        this.events = new Map([...this.events, ...moduleInstance.getEvents()]);
        // Register models
        moduleInstance.getModels().forEach((modelDefinition, modelName) => {
            if (!this.models.has(modelName)) {
                this.models.set(modelName, modelDefinition);
            }
            else {
                this.models.set(modelName, MergeRecursive(this.models.get(modelName), modelDefinition));
            }
        });
        /*

        // Register module routes
        this.routes = new Map([...this.routes, ...moduleInstance.getRoutes()]);

        */
    }
    initializeDiscordClient() {
        this.client = new Client({
            intents: this.settings.discordClientOptions.intents
        });
        this.client.login(this.settings.discordClientOptions.token);
        this.client.on('ready', () => {
            // Bot emoji
            console.log('[🤖🟢] Discord client ready');
        });
    }
    static splitCommandLine(commandLine) {
        //log( 'commandLine', commandLine ) ;
        //  Find a unique marker for the space character.
        //  Start with '<SP>' and repeatedly append '@' if necessary to make it unique.
        var spaceMarker = '<SP>';
        while (commandLine.indexOf(spaceMarker) > -1)
            spaceMarker += '@';
        //  Protect double-quoted strings.
        //   o  Find strings of non-double-quotes, wrapped in double-quotes.
        //   o  The final double-quote is optional to allow for an unterminated string.
        //   o  Replace each double-quoted-string with what's inside the qouble-quotes,
        //      after each space character has been replaced with the space-marker above.
        //   o  The outer double-quotes will not be present.
        var noSpacesInQuotes = commandLine.replace(/"([^"]*)"?/g, (fullMatch, capture) => {
            return capture.replace(/ /g, spaceMarker);
        });
        //  Now that it is safe to do so, split the command-line at one-or-more spaces.
        var mangledParamArray = noSpacesInQuotes.split(/ +/);
        //  Create a new array by restoring spaces from any space-markers.
        var paramArray = mangledParamArray.map((mangledParam) => {
            return mangledParam.replace(RegExp(spaceMarker, 'g'), ' ');
        });
        return paramArray;
    }
    async memberHasPermission(member, channel, permission) {
        let memberPermission = await channel.permissionsFor(member);
        return memberPermission.has(permission);
    }
    async getGuildSettings(guildId) {
        const Guild = this.models.get('Guild');
        let guild = await Guild.findOne({ guild_id: guildId }).exec();
        if (guild == null) {
            guild = new Guild({
                guild_id: guildId,
            });
            await guild.save();
        }
        return guild;
    }
    async refreshSlashCommands() {
        const rest = new REST({ version: '10' }).setToken(this.settings.discordClientOptions.token);
        let commands = Array.from(this.commands.values())
            .filter((command) => command.type == CommandType.slash || command.type == CommandType.separated || command.type == CommandType.any)
            .map((command) => {
            let slashCommand = new SlashCommandBuilder()
                .setName(command.name)
                .setDescription(this.translations.get('command.' + command.name + '.description', 'en'));
            if (command.args) {
                command.args.forEach((arg) => {
                    let method;
                    switch (arg.type) {
                        case 'string':
                            method = 'addStringOption';
                            break;
                        case 'user':
                        case 'member':
                            method = 'addUserOption';
                            break;
                        case 'channel':
                            method = 'addChannelOption';
                            break;
                        case 'role':
                            method = 'addRoleOption';
                            break;
                        default:
                            throw new Error('Invalid argument type ' + arg.type);
                    }
                    slashCommand[method]((option) => {
                        option.setName(arg.name);
                        option.setDescription(this.translations.get('command.' + command.name + '.args.' + arg.name + '.description', 'en'));
                        option.setRequired(!arg.optional);
                        if (arg.choices) {
                            // if arg.choices is function, call it
                            if (typeof arg.choices == 'function') {
                                arg.choices = arg.choices();
                            }
                            arg.choices.forEach((choice) => {
                                option.addChoices({
                                    name: choice.name,
                                    value: choice.value
                                });
                            });
                        }
                        return option;
                    });
                });
            }
            return slashCommand.toJSON();
        });
        const data = await rest.put(Routes.applicationCommands(this.settings.discordClientOptions.clientId), { body: commands });
        console.debug(`Successfully reloaded ${data.length} of ${commands.length} application (/) commands.`);
    }
}
function MergeRecursive(obj1, obj2) {
    for (var p in obj2) {
        try {
            // Property in destination object set; update its value.
            if (obj2[p].constructor == Object) {
                obj1[p] = MergeRecursive(obj1[p], obj2[p]);
            }
            else {
                obj1[p] = obj2[p];
            }
        }
        catch (e) {
            // Property in destination object not set; create it and set its value.
            obj1[p] = obj2[p];
        }
    }
    return obj1;
}
