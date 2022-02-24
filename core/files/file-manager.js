import path from 'path';
import os from 'os';
import config, {TRANSACTION_FEE_DEFAULT} from '../config/config';
import fs from 'fs';
import crypto from 'crypto';
import wallet from '../wallet/wallet';
import mutex from '../mutex';


class FileManager {
    constructor() {
        this.filesRootFolder = null;
    }

    initialize() {
        this.filesRootFolder = path.join(os.homedir(), config.FILES_CONNECTION.FOLDER);
        if (!fs.existsSync(this.filesRootFolder)) {
            fs.mkdirSync(path.join(this.filesRootFolder));
        }
    }

    uploadFiles(files, fees, address) {
        return new Promise((resolve, reject) => {
            fs.readFile(path.join(os.homedir(), config.WALLET_KEY_PATH), 'utf8', (err, data) => {
                //Verify if mnemonic is available
                if (err) {
                    return reject('Couldn\'t read wallet mnemonic');
                }

                //Create directory for my files (if not exist)
                let walletKeyIdentifier = wallet.getKeyIdentifier();
                let personalFolder      = path.join(this.filesRootFolder, walletKeyIdentifier);
                if (!fs.existsSync(personalFolder)) {
                    fs.mkdirSync(path.join(personalFolder));
                }

                //Init ciphers and attr
                const keybuf            = crypto.randomBytes(32);
                const key               = crypto.createSecretKey(keybuf).export().toString('hex');
                const cipher            = crypto.createCipher('aes-256-cbc', key);
                let transationAttr      = {};
                transationAttr['files'] = [];

                const promisesForTransaction = files.rows.map(upFile => new Promise((resolve, reject) => {
                    let filePath   = upFile.path;
                    let publicFile = upFile.public || false;
                    let md5sum     = crypto.createHash('md5');

                    //Read files to create transaction before writing them
                    fs.readFile(filePath, function(err, file) {
                        if (err) {
                            return reject(err);
                        }
                        let fileHash = md5sum.update(file).digest('hex');
                        if (publicFile) {
                            transationAttr['shared_key'] = key;
                        }
                        transationAttr['files'].push({
                            'public': publicFile,
                            'hash'  : fileHash,
                            'size'  : upFile.size,
                            'type'  : upFile.type,
                            'name'  : upFile.name
                        });//meter aqui a chave privada
                        resolve();
                    });
                }));

                //After reading all files
                Promise.all(promisesForTransaction)
                       .then(() => {
                           return new Promise((resolve, reject) =>{
                                //create transaction
                               mutex.lock(['submit_transaction'], (unlock) => {
                                   wallet.addTransaction([address],{
                                       fee_type: 'transaction_fee_default',
                                       amount  : fees
                                   }, null, null, transationAttr)
                                         .then(transaction => {
                                             unlock();
                                             resolve(transaction);
                                         })
                                         .catch(e => {
                                             console.log(`error`);
                                             unlock();
                                             reject();
                                         });
                               })
                           })
                       })
                       .then((transactionID) => {
                           //Create transaction directory to write file
                           let transationFolder = path.join(personalFolder, transactionID);
                           if (!fs.existsSync(transationFolder)) {
                               fs.mkdirSync(path.join(transationFolder));
                           }

                           //Write files
                           const promisesToWrite = files.rows.map(upFile => new Promise((resolve, reject) => {
                               let filePath   = upFile.path;
                               let publicFile = upFile.public;
                               let md5sum     = crypto.createHash('md5');

                               if (publicFile) {
                                   const input = fs.createReadStream(filePath);
                                   fs.readFile(filePath, function(err, file) {
                                       if (err) {
                                           return reject(err);
                                       }
                                       let fileHash = md5sum.update(file).digest('hex');
                                       let outPath  = path.join(transationFolder, fileHash);
                                       const output = fs.createWriteStream(outPath);
                                       input.pipe(cipher).pipe(output);
                                       resolve();
                                   });
                               }
                               else {
                                   const input = fs.createReadStream(filePath);
                                   fs.readFile(filePath, function(err, file) {
                                       if (err) {
                                           return reject(err);
                                       }

                                       const individualKeybuf            = crypto.randomBytes(32);
                                       const individualKey               = crypto.createSecretKey(individualKeybuf).export().toString('hex');
                                       const individualCipher            = crypto.createCipher('aes-256-cbc', individualKey);
                                       const encryptedKey                = btoa(individualKey);

                                       let fileHash = md5sum.update(file).digest('hex');
                                       let outPath  = path.join(transationFolder, fileHash);
                                       const output = fs.createWriteStream(outPath);
                                       output.write("{'key':"+encryptedKey+"}");
                                       input.pipe(individualCipher).pipe(output);
                                       resolve();
                                   });
                               }
                           }));

                           //add json file com os attributos
                           Promise.all(promisesToWrite)
                                  .then(() => {
                                      resolve();
                                  });
                       })
                       .then(() => {
                            resolve();
                        });;

            });
        });
    }

    writeFiles(files) {

    }

    readFile(file) {

    }

    writeEncriptedFiles(files) {

    }

    readEncriptedFile(file) {

    }


}


export default new FileManager();
