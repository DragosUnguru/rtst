import React, { Component } from "react";
import io from "socket.io-client";

const DOWNSAMPLING_WORKER = "./downsampling_worker.js";
const fs = require("fs");
const ss = require("socket.io-stream");

class App extends Component {
    constructor(props) {
        super(props);
        this.state = {
            connected: false,
            recording: false,
            recordingStart: 0,
            recordingTime: 0,
            recognitionOutput: [],
            btnText: "Start recording",
            webSpeechAPI: false,
            witAIAPI: false,
        };
        this.SpeechRecognition =
            window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new this.SpeechRecognition();
        this.recognition.addEventListener("result", this.onResult);
        this.recognition.continuous = true;
        this.recognitionCount = 0;
    }

    onResult = (event) => {
        const res = event.results[event.results.length - 1];
        const { recognitionOutput } = this.state;
        const resjson = {
            id: this.recognitionCount++,
            text: res[0].transcript,
        };
        recognitionOutput.unshift(resjson);
        this.setState({ recognitionOutput });
        console.log(res);
    };

    componentDidMount() {
        this.socket = io.connect("http://localhost:4000", {});

        this.socket.on("connect", () => {
            console.log("socket connected");
            this.setState({ connected: true });
        });

        this.socket.on("disconnect", () => {
            console.log("socket disconnected");
            this.setState({ connected: false });
            this.stopRecording();
        });

        this.socket.on("recognize", (results) => {
            console.log("recognized:", results);
            const { recognitionOutput } = this.state;
            results.id = this.recognitionCount++;
            recognitionOutput.unshift(results);
            this.setState({ recognitionOutput });
        });
    }

    render() {
        return (
            <div className="App">
                <div class="box">
                    <h1>Real time speech to text</h1>
                    <button class="custom-btn" onClick={this.manageButton}>
                        {this.state.btnText}
                    </button>
                    {/* <div class="webSpeechApi">
                        <input
                            type="checkbox"
                            id="webSpeechApi"
                            onChange={this.manageWebSpeechApi}
                        />
                        <label for="webSpeechApi">Use Web Speech API</label>
                    </div> */}
                    <input
                        type="file"
                        class="file-input"
                        accept=".wav"
                        onChange={this.processFile}
                    ></input>
                    {/* <div class="witAIApi">
                        <input
                            type="checkbox"
                            id="witAIApi"
                            onChange={this.manageWitAIApi}
                        />
                        <label for="witAIApi">Use Wit Ai API</label>
                    </div> */}

                    {this.renderTime()}
                    {this.renderRecognitionOutput()}
                </div>
            </div>
        );
    }

    manageWebSpeechApi = (_e) => {
        this.setState((prevState) => ({
            webSpeechAPI: !prevState.webSpeechAPI,
        }));
    };

    manageWitAIApi = (_e) => {
        this.setState((prevState) => ({
            witAIAPI: !prevState.witAIAPI,
        }));
    };

    renderTime() {
        return (
            <span>
                {(Math.round(this.state.recordingTime / 100) / 10).toFixed(1)}s
            </span>
        );
    }

    renderRecognitionOutput() {
        return (
            <div>
                <button class="custom-btn" onClick={this.clearHistory}>
                    Clear history
                </button>
                <ul>
                    {this.state.recognitionOutput.map((r) => {
                        return <li key={r.id}>{r.text}</li>;
                    })}
                </ul>
            </div>
        );
    }

    createAudioProcessor(audioContext, audioSource) {
        let processor = audioContext.createScriptProcessor(4096, 1, 1);

        const sampleRate = audioSource.context.sampleRate;

        let downsampler = new Worker(DOWNSAMPLING_WORKER);
        downsampler.postMessage({
            command: "init",
            inputSampleRate: sampleRate,
        });
        downsampler.onmessage = (e) => {
            if (this.socket.connected) {
                this.socket.emit("stream-data", e.data.buffer);
            }
        };

        processor.onaudioprocess = (event) => {
            var data = event.inputBuffer.getChannelData(0);
            downsampler.postMessage({ command: "process", inputFrame: data });
        };

        processor.shutdown = () => {
            processor.disconnect();
            this.onaudioprocess = null;
        };

        processor.connect(audioContext.destination);

        return processor;
    }

    startRecording() {
        if (!this.state.webSpeechAPI) {
            if (!this.state.recording) {
                this.recordingInterval = setInterval(() => {
                    let recordingTime =
                        new Date().getTime() - this.state.recordingStart;
                    this.setState({ recordingTime });
                }, 100);

                this.setState(
                    {
                        recording: true,
                        recordingStart: new Date().getTime(),
                        recordingTime: 0,
                        btnText: "Stop recording",
                    },
                    () => {
                        this.startMicrophone();
                    }
                );
            }
        } else {
            this.recognition.start();
            this.recordingInterval = setInterval(() => {
                let recordingTime =
                    new Date().getTime() - this.state.recordingStart;
                this.setState({ recordingTime });
            }, 100);
            this.setState({
                recording: true,
                recordingStart: new Date().getTime(),
                recordingTime: 0,
                btnText: "Stop recording",
            });
            console.log("started web speech api");
        }
    }

    startMicrophone() {
        this.audioContext = new AudioContext();

        const success = (stream) => {
            console.log("started recording");
            this.mediaStream = stream;
            this.mediaStreamSource =
                this.audioContext.createMediaStreamSource(stream);
            this.processor = this.createAudioProcessor(
                this.audioContext,
                this.mediaStreamSource
            );
            this.mediaStreamSource.connect(this.processor);
        };

        const fail = (e) => {
            console.error("recording failure", e);
        };

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices
                .getUserMedia({
                    video: false,
                    audio: true,
                })
                .then(success)
                .catch(fail);
        } else {
            navigator.getUserMedia(
                {
                    video: false,
                    audio: true,
                },
                success,
                fail
            );
        }
    }

    stopRecording() {
        if (!this.state.webSpeechAPI) {
            if (this.state.recording) {
                if (this.socket.connected) {
                    this.socket.emit("stream-reset");
                }
                clearInterval(this.recordingInterval);
                this.setState(
                    {
                        btnText: "Start recording",
                        recording: false,
                    },
                    () => {
                        this.stopMicrophone();
                    }
                );
            }
        } else {
            this.recognition.stop();
            clearInterval(this.recordingInterval);
            this.setState({
                recording: false,
                btnText: "Start recording",
            });
            console.log("stopped recording web speech api");
        }
    }

    processFile = (e) => {
        if (!this.state.witAIAPI) {
            if (this.socket.connected) {
                var file = e.target.files[0];
                var stream = ss.createStream();

                // upload a file to the server.
                ss(this.socket).emit("file", stream, { size: file.size });
                ss.createBlobReadStream(file).pipe(stream);
            }
        } else {
            var file = e.target.files[0];
            var stream = ss.createStream();

            console.log("wit ai");
            // upload a file to the server.
            ss(this.socket).emit("witAIFile", stream, { size: file.size });
            ss.createBlobReadStream(file).pipe(stream);
        }
    };

    manageButton = (e) => {
        if (this.state.recording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    };

    clearHistory = (e) => {
        this.setState((_state, _props) => {
            return { recognitionOutput: [] };
        });
    };

    stopMicrophone() {
        if (this.mediaStream) {
            this.mediaStream.getTracks()[0].stop();
        }
        if (this.mediaStreamSource) {
            this.mediaStreamSource.disconnect();
        }
        if (this.processor) {
            this.processor.shutdown();
        }
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}

export default App;
