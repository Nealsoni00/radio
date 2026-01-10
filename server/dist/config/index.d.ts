export declare const config: {
    server: {
        port: number;
        host: string;
    };
    trunkRecorder: {
        statusUrl: string;
        audioPort: number;
        fftPort: number;
        audioDir: string;
    };
    database: {
        path: string;
    };
    audio: {
        sampleRate: number;
        channels: number;
        bitDepth: number;
    };
    sdr: {
        centerFrequency: number;
        sampleRate: number;
        controlChannels: number[];
    };
    radioReference: {
        username: string;
        password: string;
        apiKey: string;
        wsdlUrl: string;
        syncDelayMs: number;
        syncBatchSize: number;
    };
};
//# sourceMappingURL=index.d.ts.map