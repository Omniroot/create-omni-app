#!/usr/bin/env node

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//   /!\ DO NOT MODIFY THIS FILE /!\
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//
// create-omni-app is installed globally on people's computers. This means
// that it is extremely difficult to have them upgrade the version and
// because there's only one global version installed, it is very prone to
// breaking changes.
//
// The only job of create-omni-app is to init the repository and then
// forward all the commands to the local version of create-omni-app.
//
// If you need to add a new command, please add it to the scripts/ folder.
//
// The only reason to modify this file is to add more warnings and
// troubleshooting information for the `create-omni-app` command.
//
// Do not make breaking changes! We absolutely don't want to have to
// tell people to update their global version of create-omni-app.
//
// Also be careful with new language features.
// This file must work on Node 0.10+.
//
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//   /!\ DO NOT MODIFY THIS FILE /!\
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~



var chalk = require('chalk');

var currentNodeVersion = process.versions.node
if (currentNodeVersion.split('.')[0] < 4) {
  console.error(
    chalk.red(
      'You are running Node ' + currentNodeVersion + '.\n' +
      'Create Omni App requires Node 4 or higher. \n' +
      'Please update your version of Node.'
    )
  );
  process.exit(1);
}

var commander = require('commander');
var fs = require('fs-extra');
var path = require('path');
var execSync = require('child_process').execSync;
var spawn = require('cross-spawn');
var semver = require('semver');

var projectName;

var program = commander
  .version(require('./package.json').version)
  .arguments('<project-directory>')
  .usage(chalk.green('<project-directory>') + ' [options]')
  .action(function (name) {
    projectName = name;
  })
  .option('--verbose', 'print additional logs')
  .option('--scripts-version <alternative-package>', 'use a non-standard version of omni-scripts')
  .allowUnknownOption()
  .on('--help', function () {
    console.log('    Only ' + chalk.green('<project-directory>') + ' is required.');
    console.log();
    console.log('    A custom ' + chalk.cyan('--scripts-version') + ' can be one of:');
    console.log('      - a specific npm version: ' + chalk.green('0.1.0'));
    console.log('      - a custom fork published on npm: ' + chalk.green('my-omni-scripts'));
    console.log('      - a .tgz archive: ' + chalk.green('https://mysite.com/my-omni-scripts-0.1.0.tgz'));
    console.log('    It is not needed unless you specifically want to use a fork.');
    console.log();
    console.log('    If you have any problems, do not hesitate to file an issue:');
    console.log('      ' + chalk.cyan('https://github.com/Omniroot/create-omni-app/issues/new'));
    console.log();
  })
  .parse(process.argv);

if (typeof projectName === 'undefined') {
  console.error('Please specify the project directory:');
  console.log('  ' + chalk.cyan(program.name()) + chalk.green(' <project-directory>'));
  console.log();
  console.log('For example:');
  console.log('  ' + chalk.cyan(program.name()) + chalk.green(' my-omni-app'));
  console.log();
  console.log('Run ' + chalk.cyan(program.name() + ' --help') + ' to see all options.');
  process.exit(1);
}

var hiddenProgram = new commander.Command()
  .option('--internal-testing-template <path-to-template>', '(internal usage only, DO NOT RELY ON THIS) ' +
    'use a non-standard application template')
  .parse(process.argv)

createApp(projectName, program.verbose, program.scriptsVersion, hiddenProgram.internalTestingTemplate);

function createApp(name, verbose, version, template) {
  var root = path.resolve(name);
  var appName = path.basename(root);

  checkAppName(appName);
  fs.ensureDirSync(name);
  if (!isSafeToCreateProjectIn(root)) {
    console.log('The directory ' + chalk.green(name) + ' contains files that could conflict.');
    console.log('Try using a new directory name.');
    process.exit(1);
  }

  console.log(
    'Creating a new Omni app in ' + chalk.green(root) + '.'
  );
  console.log();

  var packageJson = {
    name: appName,
    version: '0.1.0',
    private: true,
  };
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
  var originalDirectory = process.cwd();
  process.chdir(root);

  console.log('Installing packages. This might take a couple minutes.');
  console.log('Installing ' + chalk.cyan('omni-scripts') + '...');
  console.log();

  run(root, appName, version, verbose, originalDirectory, template);
}

function shouldUseYarn() {
  try {
    execSync('yarnpkg --version', {stdio: 'ignore'});
    return true;
  } catch (e) {
    return false;
  }
}

function install(packageToInstall, verbose, callback) {
  var command;
  var args;
  if (shouldUseYarn()) {
    command = 'yarnpkg';
    args = [ 'add', '--dev', '--exact', packageToInstall];
  } else {
    command = 'npm';
    args = ['install', '--save-dev', '--save-exact', packageToInstall];
  }

  if (verbose) {
    args.push('--verbose');
  }

  var child = spawn(command, args, {stdio: 'inherit'});
  child.on('close', function(code) {
    callback(code, command, args);
  });
}

function run(root, appName, version, verbose, originalDirectory, template) {
  var packageToInstall = getInstallPackage(version);
  var packageName = getPackageName(packageToInstall);

  install(packageToInstall, verbose, function(code, command, args) {
    if (code !== 0) {
      console.error(chalk.cyan(command + ' ' + args.join(' ')) + ' failed');
      process.exit(1);
    }

    checkNodeVersion(packageName);

    var scriptsPath = path.resolve(
      process.cwd(),
      'node_modules',
      packageName,
      'scripts',
      'init.js'
    );
    var init = require(scriptsPath);
    init(root, appName, verbose, originalDirectory, template);
  });
}

function getInstallPackage(version) {
  var packageToInstall = 'omni-scripts';
  var validSemver = semver.valid(version);
  if (validSemver) {
    packageToInstall += '@' + validSemver;
  } else if (version) {
    // for tar.gz or alternative paths
    packageToInstall = version;
  }
  return packageToInstall;
}

// Extract package name from tarball url or path.
function getPackageName(installPackage) {
  if (installPackage.indexOf('.tgz') > -1) {
    // The package name could be with or without semver version, e.g. omni-scripts-0.2.0-alpha.1.tgz
    // However, this function returns package name only without semver version.
    return installPackage.match(/^.+\/(.+?)(?:-\d+.+)?\.tgz$/)[1];
  } else if (installPackage.indexOf('@') > 0) {
    // Do not match @scope/ when stripping off @version or @tag
    return installPackage.charAt(0) + installPackage.substr(1).split('@')[0];
  }
  return installPackage;
}

function checkNodeVersion(packageName) {
  var packageJsonPath = path.resolve(
    process.cwd(),
    'node_modules',
    packageName,
    'package.json'
  );
  var packageJson = require(packageJsonPath);
  if (!packageJson.engines || !packageJson.engines.node) {
    return;
  }

  if (!semver.satisfies(process.version, packageJson.engines.node)) {
    console.error(
      chalk.red(
        'You are running Node %s.\n' +
        'Create Omni App requires Node %s or higher. \n' +
        'Please update your version of Node.'
      ),
      process.version,
      packageJson.engines.node
    );
    process.exit(1);
  }
}

function checkAppName(appName) {
  // TODO: there should be a single place that holds the dependencies
  var dependencies = ['react', 'react-dom'];
  var devDependencies = ['omni-scripts'];
  var allDependencies = dependencies.concat(devDependencies).sort();

  if (allDependencies.indexOf(appName) >= 0) {
    console.error(
      chalk.red(
        'We cannot create a project called ' + chalk.green(appName) + ' because a dependency with the same name exists.\n' +
        'Due to the way npm works, the following names are not allowed:\n\n'
      ) +
      chalk.cyan(
        allDependencies.map(function(depName) {
          return '  ' + depName;
        }).join('\n')
      ) +
      chalk.red('\n\nPlease choose a different project name.')
    );
    process.exit(1);
  }
}

// If project only contains files generated by GH, it’s safe.
// We also special case IJ-based products .idea because it integrates with CRA:
// https://github.com/facebookincubator/create-react-app/pull/368#issuecomment-243446094
function isSafeToCreateProjectIn(root) {
  var validFiles = [
    '.DS_Store', 'Thumbs.db', '.git', '.gitignore', '.idea', 'README.md', 'LICENSE'
  ];
  return fs.readdirSync(root)
    .every(function(file) {
      return validFiles.indexOf(file) >= 0;
    });
}
