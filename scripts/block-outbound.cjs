// Tests only: permit loopback HTTP/IPC, reject a connection to any other host.
const net=require('node:net');
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){
 const value=Array.isArray(args[0])?args[0][0]:args[0];
 if(typeof value==='string'&&(value.startsWith('/')||value.startsWith('\\\\.\\pipe\\')))return connect.apply(this,args);
 const host=typeof value==='object'?value.host:typeof args[1]==='string'?args[1]:'localhost';
 if(['127.0.0.1','localhost','::1'].includes(host??'localhost'))return connect.apply(this,args);
 console.error('GOLF_TEST_OUTBOUND_DENIED');throw new Error('Tests permit loopback only.');
};
