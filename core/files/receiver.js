import express from 'express';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import cors from 'cors';
import chunker from './chunker';
import path from 'path';
import os from 'os';
import config, {NODE_BIND_IP} from '../config/config';
import https from 'https';
import walletUtils from '../wallet/wallet-utils';
import queue from './queue';
import request from 'request';

class Receiver{
    constructor(){
        this.isSenderPublic = false;
        this.filesRootFolder = null;
        this.isSenderPublic  = true;
        this.serverOptions   = {};
        this.httpsServer     = null;
        this.app             = null;
    }

    initialize() {
        return new Promise((resolve, reject) => {
            this._setUpApp();
            this.filesRootFolder = path.join(os.homedir(), config.FILES_CONNECTION.FOLDER);

            walletUtils.loadNodeKeyAndCertificate()
                       .then(({
                                  certificate_private_key_pem: certificatePrivateKeyPem,
                                  certificate_pem            : certificatePem,
                                  node_private_key           : nodePrivateKey,
                                  node_public_key            : nodePublicKey
                              }) => {
                           this.serverOptions = {
                               key      : certificatePrivateKeyPem,
                               cert     : certificatePem,
                               ecdhCurve: 'prime256v1'
                           };
                           resolve();
                       }).then(() => {
                queue.initialize().then(() => {
                    const promisesToSend = queue.getListOfPendingFiles().rows.map(requestInfo => new Promise((resolve, reject) => {
                        this._startSending(resolve, reject, requestInfo);
                    }));
                    Promise.all(promisesToSend)
                           .then(() => {
                               resolve();
                           });
                });
            });
        });
    }

    receive(server, requestInfo){
        return new Promise((resolve, reject) => {
            if (!this.isSenderPublic && !requestInfo.receiver_public) {
             console.log('Both peers are private! Cannot communicate!');
             reject();
             }

            if (this.isSenderPublic) {
                this._receiveFromPublicServer(server, requestInfo)
                    .then(()=>{
                        resolve();
                    }).catch(e => {
                    console.log('error');
                    reject();
                });
            }
            else {
                this._receiveFromPrivateServer(server, requestInfo)
                    .then(()=>{
                        resolve();
                    }).catch(e => {
                    console.log('error');
                    reject();
                });
            }
        });
    }

    _receiveFromPublicServer(server, requestedFiles){
        return new Promise((resolve, reject) => {
            const wallet = requestedFiles.wallet;
            const transactionId = requestedFiles.transaction;
            const promisesToReceive = requestedFiles.files.map(file => new Promise((resolve, reject) => {
                for (let chunk = 0; chunk < file.chunks; chunk++){
                    const service = server.concat("/file/").concat(wallet).concat("/").concat(transactionId).concat("/").concat(file.name).concat("/").concat(chunk);
                    console.log(service)
                    request.get(service, (error, response, body) => {
                        if(error) {
                            console.log("error")
                            reject();
                        }
                        chunker.writeFile(wallet, transactionId, file.name, body);
                    });
                }
                resolve();
            }));

            Promise.all(promisesToReceive)
                   .then(() => {
                       return new Promise((resolve, reject) => {
                           const service = server.concat("/ack");
                           request.post(service, (error, response, body) => {
                               if(error) {
                                   console.log("error")
                                   reject();
                               }
                               resolve();
                           });
                       });
                   })
                   .then(() => {
                       resolve();
                   });
        });
    }

    _receiveFromPrivateServer(server, requestInfo){
        return new Promise((resolve, reject) => {
            console.log("eeee");
            resolve();
        });
    }

    _setUpApp(){
        let filesRootFolder = this.filesRootFolder;
        this.app = express();
        this.app.use(helmet());
        this.app.use(bodyParser.json({limit: '50mb'}));
        this.app.use(cors());

        this.app.post("/file/:wallet/:txid/:fname/:chunkn", (req, res) => {
            let wallet = req.params.wallet;
            let transactionId = req.params.txid;
            let fileName = req.params.fname;
            let chunkNumber = req.params.chunkn;

            console.log(req.body);

            /*let location = path.join(filesRootFolder, wallet);
             location = path.join(location, transactionId);
             location = path.join(location, fileName);

             res.writeHead(200);
             chunker.getChunck(res, location, chunkNumber);*/
        });

        this.app.post("/ack", function (req, res) {
            //VALIDATE REQUEST (SIGNATURE)
            queue.decrementReceiverServerInstances();
            res.writeHead(200);
            res.end("ok");
        });
    }


    getPublicReceiverInfo(){
        if(!queue.anyActiveReceiverServer()){
            this.httpsServer = https.createServer(this.serverOptions, this.app).listen(0);
            console.log('Listening on port ' + this.httpsServer.address().port);
        }
        queue.incrementReceiverServerInstances();
        return this.httpsServer;
    }
}

export default new Receiver();
