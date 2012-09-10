var program = require('commander')
  , deployd = require('../')
  , repl = require('../lib/client/repl')
  , shelljs = require('shelljs/global')
  , mongod = require('../lib/util/mongod')
  , path = require('path')
  , fs = require('fs')
  , tty = require('tty')
  , remote = require('../lib/client/remote')
  , request = require('request')
  , package = require('../package')
  , latestversionFile = path.join(__dirname, '../.latestversion')
  , Deployment = require('../lib/client/deploy').Deployment
  , open = require('../lib/util/open');

/**
 * listen for start command
 */

process.on('message', function (msg) {
  if(msg.command === 'start') {
    start(msg.file, msg.program);
  }
})

function generatePort() {
  var portRange = [ 3000, 9000 ];
  return Math.floor(Math.random() * (portRange[1] - portRange[0])) + portRange[0];
}

function checkForUpdates() {
  request('http://registry.npmjs.org/deployd', function(err, res, body) {
    if (!err) {
      var json;
      try {
        json = JSON.parse(body);  
      } catch (ex) {}

      if (json && json['dist-tags'] && json['dist-tags'].latest) {
        var latest = json['dist-tags'].latest;
        fs.writeFile(latestversionFile, latest);
      }
    }
  });
}

function start(file, program) {
  var port = program.port || 2403
    , mongoPort = generatePort();
  if (file) {
    process.chdir(path.dirname(file));
  }
  if (test('-f', 'app.dpd')) {
    console.log("starting deployd v" + package.version + "...");

    if (fs.existsSync(latestversionFile)) {
      var latest = fs.readFileSync(latestversionFile, 'utf-8');
      if (latest && latest !== package.version) {
        console.log("deployd v" + latest + " is available. Use dpd-update command to install");
      }  
    }
    checkForUpdates();
    
    if (!test('-d', './.dpd')) mkdir('-p', './.dpd');
    if (!test('-d', './.dpd/pids')) mkdir('-p', './.dpd/pids');
    if (!test('-d', './data')) mkdir('-p', './data');

    mongod.restart(program.mongod || 'mongod', process.env.DPD_ENV || 'development', mongoPort, function(err) {
      if (err) { 
        console.log("Failed to start MongoDB");
        return stop(1);
      }
      var options = {port: port, env: 'development', db: {host: '127.0.0.1', port: mongoPort, name: '-deployd'}}

      options.env = program.environment || process.env.DPD_ENV || options.env;
      if(options.env !== 'development') console.log('starting in %s mode', options.env);

      var dpd = deployd(options);
      dpd.listen();
      dpd.on('listening', function () {

        console.info('listening on port', port);
        var commands = repl(dpd);
        if (program.dashboard) {
          commands.dashboard();
        } else if (program.open) {
          commands.open();
        }
      });
    });
  } else {
    console.log("This directory does not contain a Deployd app!");
    console.log("Use \"dpd create <appname>\" to create a new app");
    console.log("or use \"dpd path/to/app.dpd\" to start an app in another directory");
    stop(1);
  }
}

function stop(code) {
  var fn = function() {
    exit(code);
  };

  if (program.wait) {
    process.stdin.resume();
    process.stdin.setRawMode(true);
    process.stdout.write('\nPress any key to continue...\n');
    process.stdin.on('keypress', fn);
  } else {
    fn();
  }
}