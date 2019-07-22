'use strict'

const hapi = require('hapi');				// Server framework
const get = require('request-promise');		// REST client
const promiseAll = require('promises-all');	// Parallel processing 
const vision = require('vision');			// View engine for HAPI
const handlebars = require('handlebars');	// Templating module
const fs = require('fs');					// File system operations
const numeralHelper = require("handlebars.numeral");	// Number formatting
const prettyjson = require('prettyjson');	// JSON formatting
const util = require('util');				// Utilities module
const debug = require('debug')('server');	// Debug module
const config = require('./config');

const server = new hapi.Server();

server.connection({
	host: '127.0.0.1',
	port: 3000
});

// Register vision for our views
server.register(vision, (err) => {
	server.views({
		engines: {
			html: handlebars
		},
		relativeTo: __dirname,
		path: ['./views', './views/partials']
	});
});

// Default routes to author search
server.route({
	method: 'GET',
	path: '/',
	handler: function (request, reply) {
		reply.redirect('/authors');
	}
});

// Show search form
server.route([{
	method: 'GET',
	path: '/authors',
	handler: function (request, reply) {
		reply.view('search.html', { entityType: "author" });
	}
}, {
	method: 'GET',
	path: '/countries',
	handler: function (request, reply) {
		reply.view('search.html', { entityType: "country" });
	}
}, {
	method: 'GET',
	path: '/countryGroups',
	handler: function (request, reply) {
		reply.view('search.html', { entityType: "countryGroup" });
	}
}, {
	method: 'GET',
	path: '/institutions',
	handler: function (request, reply) {
		reply.view('search.html', { entityType: "institution" });
	}
}, {
	method: 'GET',
	path: '/institutionGroups',
	handler: function (request, reply) {
		reply.view('search.html', { entityType: "institutionGroup" });
	}
}, {
	method: 'GET',
	path: '/topics',
	handler: function (request, reply) {
		reply.view('search.html', { entityType: "topic" });
	}
}]);

// Submit search
server.route({
	method: 'GET',
	path: '/search',
	handler: function(request, reply) {
		const entityType = request.query.entityType;
		if (entityType == "author") {
			var options = getBasicOptions('https://api.elsevier.com/content/search/author');
			options.qs = {
				query: getAuthorQuery(request.query.name),
				count: 20
			}
			get(options)
				.then(function(body) {
					const results = JSON.parse(body)['search-results'];
					debug('Search results:\n' + prettyjson.render(results));
					reply.view('authorResults', {result: results});
				}).catch(function(error) {
					throw error;
				});
		} else {
			var options = getBasicOptions('https://api.elsevier.com/analytics/scival/'+entityType+'/search');
			options.qs = {
				query: util.format('name(%s)', request.query.name)
			}
			get(options)
				.then(function(body) {
					const results = JSON.parse(body)['results'];
					debug('Search results:\n' + prettyjson.render(results));
					reply.view('results', {
						result: results,
						entityType: entityType
					});
				}).catch(function(error) {
					throw error;
				});
		}
	}
});

// Show a particular entity
server.route([{
	method: 'GET',
	path: '/author/{id}',
	handler: function(request, reply) {
		var promises = [];
		var context = {};

		// Get the authors metrics from SciVal
		const authorId = request.params.id;
		var options = getBasicOptions('https://api.elsevier.com/analytics/scival/author/metrics');
		options.qs = {
			metricTypes: 'ScholarlyOutput,CitationCount,hIndices,FieldWeightedCitationImpact,CitationsPerPublication,Collaboration',
			byYear: false,
			yearRange: '5yrsAndCurrent',
			authors: authorId
		}
		// Add metrics request to list of promises
		promises.push(
			get(options)
				.then(function(body) {
					const results = JSON.parse(body).results;
					debug('Metric results:\n' + prettyjson.render(results));
					context.results = results;
				}).catch(function(error) {
					throw error;
				})
		);

		// Get the authors most recent pubs from Scopus
		options.url = 'https://api.elsevier.com/content/search/scopus';
		options.qs = {
			query: util.format('au-id(%s)', authorId),
			field: 'eid,title,citedby-count,coverDate',
			sort: 'coverDate',
			count: 5
		}
		// Add pubs request to list of promises
		promises.push(
			get(options)
				.then(function(body) {
					const entry = JSON.parse(body)['search-results'].entry;
					debug('Scopus search:\n' +prettyjson.render(entry));
					context.docs = entry;
				}).catch(function(error) {
					throw error;
				})
		);

		// Execute promises asynchronously
		promiseAll.all(promises)
			.then(function() {
				reply.view('author', context);
			}).catch(function(error) {
				throw error;
			})
	}
}, {
	method: 'GET',
	path: '/country/{id}',
	handler: function(request, reply) {
		// Get the country metrics from SciVal
		const countryId = encodeURIComponent(request.params.id);
		var options = getBasicOptions('https://api.elsevier.com/analytics/scival/country/metrics');
		options.qs = {
			metricTypes: 'ScholarlyOutput,CitationCount,FieldWeightedCitationImpact,CitationsPerPublication,Collaboration',
			byYear: false,
			yearRange: '5yrsAndCurrent',
			countryIds: countryId
		}
		get(options)
			.then(function(body) {
				const results = JSON.parse(body).results;
				debug('Metric results:\n' + prettyjson.render(results));
				reply.view('country', {results: results});
			}).catch(function(error) {
				throw error;
			})
		}
}, {
	method: 'GET',
	path: '/countryGroup/{id}',
	handler: function(request, reply) {
		var promises = [];
		var context = {};

		// Get the country group metrics from SciVal
		const countryGroupId = request.params.id;
		var options = getBasicOptions('https://api.elsevier.com/analytics/scival/countryGroup/metrics');
		options.qs = {
			metricTypes: 'ScholarlyOutput,CitationCount,FieldWeightedCitationImpact,CitationsPerPublication,Collaboration',
			byYear: false,
			yearRange: '5yrsAndCurrent',
			countryGroupIds: countryGroupId
		}
		// Add metrics request to list of promises
		promises.push(
			get(options)
				.then(function(body) {
					const results = JSON.parse(body).results;
					debug('Metric results:\n' + prettyjson.render(results));
					context.results = results;
				}).catch(function(error) {
					throw error;
				})
		);

		// Get the country group details
		options.url = 'https://api.elsevier.com/analytics/scival/countryGroup/'+countryGroupId;
		// Add details request to list of promises
		promises.push(
			get(options)
				.then(function(body) {
					const countryGroup = JSON.parse(body).countryGroup;
					debug('Country group:\n' +prettyjson.render(countryGroup));
					context.countryGroup = countryGroup;
				}).catch(function(error) {
					throw error;
				})
		);

		// Execute promises asynchronously
		promiseAll.all(promises)
			.then(function() {
				reply.view('countryGroup', context);
			}).catch(function(error) {
				throw error;
			})
	}
}, {
	method: 'GET',
	path: '/institution/{id}',
	handler: function(request, reply) {
		var promises = [];
		var context = {};

		// Get the institution metrics from SciVal
		const institutionId = encodeURIComponent(request.params.id);
		var options = getBasicOptions('https://api.elsevier.com/analytics/scival/institution/metrics');
		options.qs = {
			metricTypes: 'ScholarlyOutput,CitationCount,FieldWeightedCitationImpact,CitationsPerPublication,Collaboration',
			byYear: false,
			yearRange: '5yrsAndCurrent',
			institutionIds: institutionId
		}
		// Add metrics request to list of promises
		promises.push(
			get(options)
				.then(function(body) {
					const results = JSON.parse(body).results;
					debug('Metric results:\n' + prettyjson.render(results));
					context.results = results;
				}).catch(function(error) {
					throw error;
				})
		);

		// Get the topics for the institution
		options.url = 'https://api.elsevier.com/analytics/scival/topic/institutionId/' + institutionId;
		options.qs = {
			yearRange: '5yrsAndCurrent',
			limit: 5
		}
		// Add topics request to list of promises
		promises.push(
			get(options)
				.then(function(body) {
					const topics = JSON.parse(body).topics;
					debug('Topic results:\n' + prettyjson.render(topics));
					context.topics = topics;
				}).catch(function(error) {
					throw error;
				})
		);

		// Execute promises asynchronously
		promiseAll.all(promises)
			.then(function() {
				reply.view('institution', context);
			}).catch(function(error) {
				throw error;
			})
	}
}, {
	method: 'GET',
	path: '/institutionGroup/{id}',
	handler: function(request, reply) {
		var promises = [];
		var context = {};

		// Get the metrics from SciVal
		const institutionGroupId = request.params.id;
		var options = getBasicOptions('https://api.elsevier.com/analytics/scival/institutionGroup/metrics');
		options.qs = {
			metricTypes: 'ScholarlyOutput,CitationCount,FieldWeightedCitationImpact,CitationsPerPublication,Collaboration',
			byYear: false,
			yearRange: '5yrsAndCurrent',
			institutionGroupIds: institutionGroupId
		}
		// Add metrics request to list of promises
		promises.push(
			get(options)
				.then(function(body) {
					const results = JSON.parse(body).results;
					debug('Metric results:\n' + prettyjson.render(results));
					context.results = results;
				}).catch(function(error) {
					throw error;
				})
		);

		// Get the country group details
		options.url = 'https://api.elsevier.com/analytics/scival/institutionGroup/'+institutionGroupId;
		// Add details request to list of promises
		promises.push(
			get(options)
				.then(function(body) {
					const institutionGroup = JSON.parse(body).institutionGroup;
					debug('Institution group:\n' +prettyjson.render(institutionGroup));
					context.institutionGroup = institutionGroup;
				}).catch(function(error) {
					throw error;
				})
		);

		// Execute promises asynchronously
		promiseAll.all(promises)
			.then(function() {
				reply.view('institutionGroup', context);
			}).catch(function(error) {
				throw error;
			})
	}
}, {
	method: 'GET',
	path: '/topic/{id}',
	handler: function(request, reply) {
		// Get the topic metrics from SciVal
		const topicId = encodeURIComponent(request.params.id);
		var options = getBasicOptions('https://api.elsevier.com/analytics/scival/topic/metrics');
		options.qs = {
			metricTypes: 'ScholarlyOutput,CitationCount,FieldWeightedCitationImpact,InstitutionCount',
			byYear: false,
			yearRange: '5yrsAndCurrent',
			topicIds: topicId
		}
		get(options)
			.then(function(body) {
				const results = JSON.parse(body).results;
				debug('Metric results:\n' + prettyjson.render(results));
				reply.view('topic', {results: results});
			}).catch(function(error) {
				throw error;
			})
		}
}]);

// Show a particular abstact
server.route({
	method: 'GET',
	path: '/abstract/{id}',
	handler: function(request, reply) {
		const eid = encodeURIComponent(request.params.id);
		var options = getBasicOptions('https://api.elsevier.com/content/abstract/eid/' + eid);
		options.qs = {
			view: 'META_ABS',
			httpAccept: 'application/json'
		}
		get(options)
			.then(function(body) {
				const abstract = JSON.parse(body)['abstracts-retrieval-response'];
				debug('Scopus abstract:\n' + prettyjson.render(abstract));
				reply.view('abstract', {result: abstract});
			}).catch(function(error) {
				throw error;
			})
	},
});

// Helper function that extracts the numeric portion of a Scopus EID.
handlebars.registerHelper('removeEIDPrefix', function(str) {
	var pos = str.lastIndexOf('-');
	return str.substring(pos+1);
});
// Helper function that adds spaces to camelcase strings
handlebars.registerHelper('camelCaseToString', function(str) {
	return str.charAt(0).toUpperCase() + str.slice(1).split(/(?=[A-Z])/).join(' ');
});
// Helper function that does a logical if comparison
handlebars.registerHelper('ifEquals', function(arg1, arg2, options) {
    return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
});
// Helper function that gets the current year
handlebars.registerHelper('currentYear', function(offset) {
    return new Date().getFullYear() - offset;
});
numeralHelper.registerHelpers(handlebars);

// Register partials
var partialsDir = __dirname + '/views/partials';
var filenames = fs.readdirSync(partialsDir);
filenames.forEach(function (filename) {
	var matches = /^([^.]+).html$/.exec(filename);
  	if (!matches) {
    	return;
	}  
	var name = matches[1];
	console.log(util.format("Registering partial file [%s]", name));
  	var template = fs.readFileSync(partialsDir + '/' + filename, 'utf8');
  	handlebars.registerPartial(name, template);
});

/**
 * Get basic REST API options
 * @param {string} url - The base URL of the REST service to call.
 */
function getBasicOptions(url) {
	return {
		url: url,
		headers: {
			'Content-Type': 'application/json',
			'X-ELS-APIKey': config.api_key,
			'X-ELS-Insttoken': config.inst_token,
			'X-ELS-Authtoken': config.auth_token
		}
	};
};

/**
 * Get Scopus author query string
 * @param {string} fullName - author full name
 */
function getAuthorQuery(fullName) {
	var firstName = fullName.split(' ').slice(0, -1).join(' ');
	var lastName = fullName.split(' ').slice(-1).join(' ');
	var query = 'authlast(' + lastName + ')';
	if (firstName) {
		query += ' and authfirst(' + firstName + ')';
	}
	return query;
}

// Start the server
server.start((err) => {
	if (err) {
		throw err;
	}
	console.log(`Server running at: ${server.info.uri}`);
});