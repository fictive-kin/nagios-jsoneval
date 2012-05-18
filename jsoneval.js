#!/usr/bin/env node

var version = '0.0.1';

var usage = "Usage: $0 -u <URI> -e <eval>\n"
 + "  -h  This message\n"
 + "  -u  URI\n"
// + "  -U  username (HTTP credentials)\n"
// + "  -P  password (HTTP credentials)\n"
 + "  -e  JS eval\n"
 + "  -a  JS assertion\n"
 + "  -w  Warning threshold\n"
 + "  -c  Critical threshold\n"
 + "  -t  test value\n"
 + "nagios-jsoneval Version: " + version;

function exitUsage(msg) {
	if (msg) {
		console.log(msg + "\n");
	}
	console.log(usage + "\n");
	process.exit(3); // UNKNOWN
}

// arguments
var argv = require("optimist")
	.usage(usage)
	.demand(['u','e'])
	.argv;

// url
var url = require("url").parse(argv.u);
switch (url.protocol) {
	case 'http:':
		url.port = url.port || 80;
		client = require('http');
		break;
	case 'https:':
		url.port = url.port || 443;
		client = require('https');
		break;
	default:
		exitUsage("Invalid URL protocol.");
}

if (!url.protocol || !(url.protocol === 'http:' || url.protocol === 'https:')) {
	exitUsage();
}

// request
var hostHeader = url.hostname;
if (url.protocol === 'https:' && url.port !== 443) {
	hostHeader += ":" + url.port;
} else if (url.protocol === 'http:' && url.port !== 80) {
	hostHeader += ":" + url.port;
}
var userAgent = 'nagios-jsoneval/' + version + ' node.js/' + process.version;
var responseHandler = function (response) {
	response.setEncoding('utf8');
	var body = "";
	response.on('data', function (chunk) {
		body += chunk;
	});
	response.on('end', function() {
		if (response.statusCode < 200 || response.statusCode >= 300) {
			console.log("CRIT: response code not 2XX: " + response.statusCode);
			process.exit(2); // CRITICAL
		}
		// body is now the full response
		try {
			json = JSON.parse(body);
		} catch (e) {
			// failed to parse; set it to null
			json = null;
		}
		doParse(json);
	});
};
var headers = {
	'user-agent': userAgent,
	'host': hostHeader,
	'accept': 'application/json, */*',
	'connection': 'close',
};
if (url.auth) {
	headers.authorization = 'Basic ' + (new Buffer(url.auth, 'ascii')).toString('base64');
}
var params = {
	host: url.hostname,
	port: url.port,
	method: 'GET',
	path: url.path,
	headers: headers
};
var request = client.request(params, responseHandler);
request.on('error', function(e) {
	console.log('ERR: problem with request: ' + e.message);
	process.exit(3); // UNKNOWN
});
request.end();

function doParse(json) {

	assertFunc = function (json) {
		return eval(argv.a);
	}

	evalFunc = function (json) {
		var retval = undefined;
		var localretval = eval(argv.e);
		if (retval !== undefined) {
			return retval;
		} else {
			return localretval;
		}
	}

	if (argv.a) {
		// check assertion
		try {
			if (!assertFunc(json)) {
				console.log("CRIT: Assertion failed");
				process.exit(2); // CRITICAL
			}
		} catch (e) {
			console.log("ERR: Assertion code failed;" + e);
			process.exit(3); // CRITICAL
		}
	}

	// check eval
	try {
		check = evalFunc(json);
	} catch (e) {
		console.log("ERR: Eval code failed; " + e);
		process.exit(3); // CRITICAL
	}

	if (undefined !== argv.t) {
		// we have a test value; check against that:
		if (check == argv.t) {
			console.log("OK: value=" + check);
			process.exit(0);
		} else {
			console.log("CRIT: value=" + check);
			process.exit(2); // CRITICAL
		}
	}

	if (undefined !== argv.c && undefined !== argv.w) {
		// check against the critical range
		if (getNagiosRangeParser(argv.c)(check)) {
			console.log("CRIT: value=" + check);
			process.exit(2); // CRITICAL
		}

		// check against the warning range
		if (getNagiosRangeParser(argv.w)(check)) {
			console.log("WARN: value=" + check);
			process.exit(1); // WARNING
		}

		// otherwise: ok
		console.log("OK: value=" + check);
		process.exit(0);

	}

	// no check value, nor critical + warning ranges
	exitUsage("Missing check value or warning+critical ranges");

}

function getNagiosRangeParser(rangeString) {
	// borrowed and ported from:
	// https://github.com/dbroeglin/nagios_check/blob/master/lib/nagios_check/range.rb
	// (MIT License)

	rangeString = rangeString.toString(); // ensure string

	if (rangeString === "") {
		return false; // invalid range
	}

	var re = /^(@)?(([-.0-9]+|~)?:)?([-.0-9]+)?$/;
	if (!rangeString.match(re)) {
		console.log("did not match");
		return false; // invalid range
	}

	var tokens = rangeString.split(re);

	var exclusive = tokens.indexOf('@') == -1;
	var min;
	switch (tokens[3]) {
		case undefined:
			min = 0;
			break;
		case '~':
			min = Infinity * -1;
			break;
		default:
			min = parseFloat(tokens[3]);
	}

	var max = tokens[4] ? parseFloat(tokens[4]) : Infinity;

	return function(val) {
		val = parseFloat(val);
		if ((val >= min) && (val <= max)) {
			return !exclusive;
		}
		return exclusive;
	}


	


/*
    def initialize(string_range)
      if string_range.nil? || string_range.empty?
        raise RuntimeError, "Pattern should not be nil"
      end
      @string_range = string_range
      tokens = string_range.scan(/^(@)?(([-.0-9]+|~)?:)?([-.0-9]+)?$/).first
      unless tokens
        raise RuntimeError, "Pattern should be of form [@][~][min]:max"
      end
      @exclusive = true if tokens.include? "@"
      case tokens[2]
      when nil, "" then @min = 0
      when '~' then @min = nil
      else @min = tokens[2].to_f
      end
      @max = tokens[3].nil? || tokens[3] == "" ? nil : tokens[3].to_f
    end

    def include?(value)
      if @exclusive
        (@min.nil? || value > @min) && (@max.nil? || value < @max)
      else
        (@min.nil? || value >= @min) && (@max.nil? || value <= @max)
      end
    end

    def ===(value)
      include?(value)
    end

    def to_s
      "Range[#{@reversed ? "~" : ""}#{@inclusive ? "@" : ""}#{@min}:#{@max}]"
    end
  end
*/

}
