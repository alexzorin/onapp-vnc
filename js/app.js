(function() {

// behold, organizational skills

var app = angular.module("onappnw", ["ui.router"]);

app.config(["$stateProvider", "$urlRouterProvider", function($stateProvider, $urlRouterProvider) {
	$urlRouterProvider.otherwise("/welcome");
	$stateProvider.state("welcome", {
		url: "/welcome",
		views: {
			"": {
				templateUrl: "tpl/welcome/index.html",
				controller: "WelcomeCtrl",
			},
			"toolbar@welcome": {
				templateUrl: "tpl/toolbar.html",
				controller: "ToolbarCtrl"
			},
			"login@welcome": {
				templateUrl: "tpl/welcome/login.html",
				controller: "WelcomeLoginCtrl"
			}
		},
	}).state("main", {
		url: "/main",
		views: {
			"": {
				templateUrl: "tpl/main/index.html"
			},
			"toolbar@main": {
				templateUrl: "tpl/toolbar.html",
				controller: "ToolbarCtrl"
			},
			"main@main": {
				templateUrl: "tpl/main/main.html",
				controller: "MainCtrl"
			}
		}
	}).state("console", {
		url: "/console/:id",
		views: {
			"": {
				templateUrl: "tpl/console/index.html"
			},
			"toolbar@console": {
				templateUrl: "tpl/toolbar.html",
				controller: "ToolbarCtrl"
			},
			"console@console": {
				templateUrl: "tpl/console/console.html",
				controller: "ConsoleCtrl"
			}
		}
	});
}]);

app.service("nw", [function() {
	var gui = require("nw.gui");
	var win = gui.Window.get();
	return {
		Minimize: function() {
			return win.minimize();
		},
		Maximize: function() {
			return win.maximize();
		},
		Restore: function() {
			return win.restore();
		},
		OpenInspector: function() {
			return win.showDevTools();
		},
		OpenInBrowser: function(url) {
			return gui.Shell.openExternal(url);
		}
	};
}]);

app.service("api", ["$rootScope", "$q", "$http", "login", function($rootScope, $q, $http, login) {
	var dashboard = login.GetHost();

	var headers = function() {
		var creds = login.GetCredentials();
		return { "Authorization": "Basic " + new Buffer(creds.email + ":" + creds.apiKey).toString("base64") };
	};

	var _get = function(res) {
		var def = $q.defer();
		$http.get(dashboard + res, {
			headers: headers()
		}).success(function(data) {
			def.resolve(data);
		}).error(function(err) {
			def.reject(err);
		});
		return def.promise;
	};

	return {
		GetProfile: function() {
			return _get("profile.json");
		},
		GetVncPassword: function(vmId) {
			var def = $q.defer();
			_get("virtual_machines/" + vmId + ".json").then(function(data) {
				if(typeof(data) !== "object") {
					def.reject("Unexpected response");
					return;
				}
				if(data.virtual_machine.booted === false) {
					def.reject("Virtual machine isn't booted!");
					return;
				}
				def.resolve(data.virtual_machine.remote_access_password);
			}, function(err) {
				def.reject(err);
			});
			return def.promise;
		},
		GetVirtualMachines: function(clearCache) {
			var def = $q.defer();
			// fetch from cache if we can
			if(clearCache !== true) {
				var ls = localStorage.getItem("vms");
				if(ls !== null) {
					var vms = JSON.parse(ls);
					$rootScope.virtualMachines = vms;
					def.resolve(vms);
					return def.promise;
				}
			}
			// otherwise pull it
			_get("virtual_machines.json").then(function(data) {
				if(typeof(data) !== "object") {
					def.reject("Unexpected response from server");
					return;
				}
				var vms = [];
				for(var i = 0; i < data.length; i++) {
					if(typeof(data[i].virtual_machine) !== "object") {
						continue;
					}
					var vm = data[i].virtual_machine;
					vms.push({
						id: vm.id,
						identifier: vm.identifier,
						label: vm.label || vm.identifier,
						hostname: vm.hostname,
						pass: vm.remote_access_password || null
					});
				}
				// save to cache
				localStorage.setItem("vms", JSON.stringify(vms));
				$rootScope.virtualMachines = vms;
				def.resolve(vms);
			}, function(err) {
				def.reject(err);
			});
			return def.promise;
		},
		GetConsoleParams: function(vmId) {
			return _get("virtual_machines/" + vmId + "/console.json");
		},
		ParseError: function(err) {
			if(typeof(err) === "string") {
				return err;
			}
			if(typeof(err) === "undefined" || typeof(err.errors) === "undefined") {
				return "An unhandled error occured >:(";
			}
			var data = err.errors;
			if(typeof(data.base) !== "undefined") {
				return data.base[0];
			}
			return "An unhandled error occured >:(";
		}
	};
}]);

app.service("login", function() {
	return { 
		GetCredentials: function() {
			var s = localStorage.getItem("credentials");
			if(s === null) {
				return null;
			} else {
				return JSON.parse(s);
			}
		},
		SetCredentials: function(email, apiKey) {
			if(typeof(email) === "undefined" ||  typeof(apiKey) === "undefined") {
				localStorage.setItem("credentials", null);
			}
			localStorage.setItem("credentials", JSON.stringify({email: email, apiKey: apiKey}));
		},
		GetHost: function() {
			return localStorage.getItem("host") || "https://dashboard.dynomesh.com.au/";
		},
		SetHost: function(v) {
			localStorage.setItem("host", v);
		}
	};
});

app.directive("loader", function() {
	return {
		restrict: "E",
		templateUrl: "app://onappnw/tpl/directives/loader.html",
		scope: {
			message: "=message",
			description: "=description"
		}
	};
});

app.controller("WelcomeCtrl", ["$scope", "nw", function($scope, nw) {
}]);

app.controller("WelcomeLoginCtrl", ["$scope", "$state", "api", "login", "nw", function($scope, $state, api, login, nw) {
	$scope.loading = false;
	$scope.login = login.GetCredentials();
	$scope.host = login.GetHost();
	if($scope.login !== null) {
		$scope.email = $scope.login.email;
		$scope.apiKey = $scope.login.apiKey;
	}
	$scope.openProfilePage = function() {
		nw.OpenInBrowser(login.GetHost() + "profile");
	};
	$scope.doLogin = function() {
		login.SetCredentials($scope.email, $scope.apiKey);
		login.SetHost($scope.host);
		$scope.loading = true;
		api.GetProfile().then(function(ok) {
			$state.go("main");
		}, function(err) {
			$scope.loading = false;
			$scope.error = api.ParseError(err);
		});
	};
}]);

app.controller("MainCtrl", ["$scope", "$state", "api", "login", function($scope, $state, api, login) {
	$scope.loading = true;
	$scope.vmFilterTerm = "";
	api.GetVirtualMachines().then(function(data) {
		$scope.vms = data;
		$scope.loading = false;
	}, function(err) {
		$scope.error = api.ParseError(err);
	});
	$scope.reloadVms = function() {
		$scope.loading = true;
		api.GetVirtualMachines(true).then(function(data) {
			$scope.vms = data;
			$scope.loading = false;
		}, function(err) {
			$scope.error = api.ParseError(err);
		});
	};
	$scope.vmFilter = function(item) {
		if($scope.vmFilterTerm === "") {
			return true;
		}
		return item.label.toLowerCase().indexOf($scope.vmFilterTerm.toLowerCase()) !== -1 || item.hostname.toLowerCase().indexOf($scope.vmFilterTerm.toLowerCase()) !== -1;
	};
	$scope.go = function(vm) {
		$state.go("console", { id: vm.id });
	};
	$scope.formGo = function() {
		$scope.error = null;
		var vm = null;
		var count = 0;
		for(var i = 0; i < $scope.vms.length; i++) {
			if($scope.vmFilter($scope.vms[i])) {
				vm = $scope.vms[i];
				count++;
			}
			if(count > 1) {
				$scope.error = "Please narrow the search to one item, or click the VM you want.";
				return;
			}
		}
		if(count === 1) {
			$scope.go(vm);
		}
	};
	$scope.logout = function() {
		login.SetCredentials();
		$state.go("welcome");
	};
}]);

app.controller("ConsoleCtrl", ["$scope", "$state", "$stateParams", "api", function($scope, $state, $stateParams, api) {
	$scope.loading = true;
	$scope.loadingMsg = "Provisioning a VNC session ...";
	$scope.vmId = $stateParams.id;
	api.GetConsoleParams($scope.vmId).then(function(data) {
		if(typeof(data.remote_access_session) !== "object") {
			$scope.error = "Dashboard server gave an unexpected response >:(";
			$scope.loading = false;
		} else {
			var ras = data.remote_access_session;
			$scope.loadingMsg = "Fetching the VNC password ...";
			api.GetVncPassword($scope.vmId).then(function(pw) {
				ras.password = pw;
				$scope.ras = ras;
				$scope.loading = false;
			}, function(err) {
				$scope.loading = false;
				$scope.error = api.ParseError(err);
			});
		}
	}, function(err) {
		$scope.loading = false;
		$scope.error = api.ParseError(err);
	});
}]);

app.service("rfb", function() {
	var canv = document.createElement("canvas");
	var rfb = new RFB({
		"target": canv,
		"encrypt": false,
		"local_cursor": true,
		"width": 800,
		"height": 600
	});
	window.rfb = rfb;
	return {
		GetElement: function() {
			return canv;
		},
		Connect: function(password) {
			return rfb.connect("localhost", 9876, password, "/");
		},
		Disconnect: function() {
			rfb.disconnect();
		}
	};
});

app.directive("vnc", ["vncProxy", "rfb", function(vncProxy, rfb) {
	return {
		restrict: "E",
		templateUrl: "app://onappnw/tpl/directives/vnc.html",
		scope: {
			ras: "=session"
		},
		link: function(scope, element, attrs) {
			scope.$watch("ras", function() {
				if(typeof(scope.ras) === "undefined") {
					return;
				}
				var canv = rfb.GetElement();
				element[0].appendChild(canv);

				var proxy = vncProxy(scope.ras);
				proxy.Listen().then(function() {
					rfb.Connect(scope.ras.password);
				}, function(err) {
					window.alert("Unable to connect to the websocket proxy");
					console.log(err);
				});
				scope.$on("$destroy", function() {
					rfb.Disconnect();
					proxy.Destroy();
					element[0].removeChild(canv);
				});
			});
		}
	};
}]);

app.service("vncProxy", ["$q", "login", function($q, login) {
	var Net = require("net"),
		Buffer = require("buffer").Buffer,
		Fs = require("fs");

	// Return this factory function to consumers
	return function(ras) {
		var tcpProxy = function(vnc) {
			return function(socket){
				// create tcp connection to VNC server
				var ts = Net.connect(vnc, function(){
					// relay data from socket to tcp
					socket.on('message', function(data, flags){
						if (flags.binary) {
						} else {
							data = new Buffer(data);
						}
						try {
							if (!ts.write(data)) {
								socket.pause();
							
								ts.once('drain', function(){
									if (socket && (socket.readyState == socket.OPEN)) socket.resume();
								});
							
								setTimeout(function(){
									if (socket && (socket.readyState == socket.OPEN)) socket.resume();
								}, 100); // 100ms
							}
						} catch (e) {
							socket.close();
						}
					});
					socket.on('close', function(){
						ts.end();
					});
					socket.on('error', function(err){
						ts.end();
					});
					
					// relay data from tcp to socket
					ts.on('data', function(data){
						try {
							if (socket.supports.binary) {
								if (!socket.send(data, {binary: true})) {
									ts.pause();
								
									socket.on('drain', function(){
										ts.resume();
									});
								 
									setTimeout(function(){
										if (ts && ts.resume) ts.resume();
									}, 100); // 100ms
								}
							} else {
								if (!socket.send(data.toString('base64'), {binary: false})) {
									ts.pause();
								
									socket.on('drain', function(){
										ts.resume();
									});
								
									setTimeout(function(){
										ts.resume();
									}, 100); // 100ms
								}
							}
						} catch (e) {
							ts.end();
						}
					});
					ts.on('end', function(){
						socket.close();
					});
					ts.on('close', function(){
						socket.close();
					});
					ts.on('error', function(){
						socket.close();
					});
				});
				ts.on('error', function(err){
					socket.close();
				});
			};
		};

		var WebsocketServer = require("ws").Server;
		var wsSrv = new WebsocketServer({
			port: 9876,
			host: "127.0.0.1"
		});
		hostUri = require("url").parse(login.GetHost());
		wsSrv.on("connection", tcpProxy({
			host: hostUri.hostname,
			port: ras.port
		}));

		return {
			Listen: function() {
				var def = $q.defer();
				var sock = new Net.Socket();
				sock.connect(9876, "localhost", function() {
					sock.destroy();
					def.resolve(null);
				});
				sock.on("error", function(e) {
					def.reject(e);
				});
				return def.promise;
			},
			Destroy: function() {
				console.log("Cleaning up proxy server");
				wsSrv.close();
				wsSrv = null;
			}
		};
	};
}]);

app.controller("ToolbarCtrl", ["$scope", "$rootScope", "nw", "api", function($scope, $rootScope, nw, api) {
	$scope.maxed = false;
	$scope.min = function() {
		nw.Minimize();
	};
	$scope.max = function() {
		if($scope.maxed) {
			nw.Restore();
		} else {
			nw.Maximize();
		}
		$scope.maxed = !$scope.maxed;
	};
	$scope.close = function() {
		process.exit();
	};
}]);

app.directive('focusMe', function($timeout, $parse) {
  return {
	link: function(scope, element, attrs) {
	  var model = $parse(attrs.focusMe);
	  scope.$watch(model, function(value) {
		if(value === true) { 
		  $timeout(function() {
			element[0].focus(); 
		  });
		}
	  });
	}
  };
});

})();
