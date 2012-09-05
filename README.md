# dialback-example

This is an example client and server for Dialback authentication.

## License

Copyright 2012, StatusNet Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

## About dialback

Dialback authentication is a proposed new way to add remote
authentication to HTTP requests.

http://www.w3.org/2005/Incubator/federatedsocialweb/wiki/Dialback_authentication

It extends the HTTP "Authorization" header to add a remote host or
Webfinger account as the responsible party. The server can use an
included "nonce" parameter to make sure the responsible party is
really responsible.

## About this example

I set up this example to test the idea. It consists of two NodeJS
servers, app.js and client.js.

I set up two [LXC](http://lxc.sourceforge.net/) virtual hosts on my
own machine and call them addserver.test and addclient.test. You can
set up your own configuration; let me know.

