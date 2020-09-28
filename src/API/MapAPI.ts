import Axios, { AxiosInstance } from "axios";
import * as qs from "querystring";

export interface IBeatmap {
    title: string
    artist: string
    creator: string
    version: string
    beatmapsetID: number
    mode: number
    difficulty: {
        ar: number
        cs: number
        hp: number
        od: number
        stars: number
    }
    bpm: {
        min: number
        max: number
        avg: number
    }
    length: number
}

export interface IPPResponse {
    pp: number
    fcpp: number
    sspp: number
    param: {
        combo: number
        miss: number
        acc: number
        score: number
    }
}

export default class MapAPI {
    api: AxiosInstance
    constructor(
        private port: number
    ) {
        this.api = Axios.create({
            baseURL: `http://localhost:${port}`
        });
    }

    async getStatus(): Promise<any> {
        let { data } = await this.api('/');
        return data;
    }

    async getBeatmap(id: number, mods?: string[]): Promise<IBeatmap> {
        let { data } = await this.api(`/getBeatmap?${qs.stringify({ id, mods: mods?.join(",") })}`);
        return data;
    }

    async getPP(id: number, args?: IPPArguments): Promise<IPPResponse> {
        let { data } = await this.api(`/getScorePP?${qs.stringify({ id, ...args })}`);
        return data;
    }
}

interface IPPArguments {
    combo?: number;
    miss?: number;
    acc?: number;
    score?: number;
    mods?: string
}