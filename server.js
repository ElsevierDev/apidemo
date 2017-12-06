'use strict'

const hapi = require('hapi');				// Server framework
const get = require('request-promise');		// REST client
const promiseAll = require('promises-all');	// Parallel processing 
const vision = require('vision');			// View engine for HAPI
const handlebars = require('handlebars');	// Templating module
const numeralHelper = require("handlebars.numeral");	// Number formatting
const prettyjson = require('prettyjson');	// JSON formatting
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
		path: './views',
	});
});

// Show search form
server.route({
	method: 'GET',
	path: '/',
	handler: function(request, reply) {
		reply.view('index');
	}
});

// Find authors
server.route({
	method: 'GET',
	path: '/search',
	handler: function(request, reply) {
		var options = getBasicOptions('https://api.elsevier.com/content/search/author');
		options.qs = {
			query: getAuthorQuery(request.query.name),
			count: 20
		}
		get(options)
			.then(function(body) {
				const results = JSON.parse(body)['search-results'];
				debug('Search results:\n' + prettyjson.render(results));
				reply.view('results', {result: results});
			}).catch(function(error) {
				throw error;
			});
	}
});

// Show a particular author
server.route({
	method: 'GET',
	path: '/author/{id}',
	handler: function(request, reply) {
		var promises = [];
		var context = {};

		// Get the authors metrics from SciVal
		const authorId = encodeURIComponent(request.params.id);
		var options = getBasicOptions('https://api.elsevier.com/metrics');
		options.qs = {
			metrics: 'ScholarlyOutput,CitationCount,hIndices,FieldWeightedCitationImpact,CitationsPerPublication,Collaboration',
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
					context.metrics = results;
				}).catch(function(error) {
					throw error;
				})
		);

		// Get the authors most recent pubs from Scopus
		options.url = 'https://api.elsevier.com/content/search/scopus';
		options.qs = {
			query: 'au-id(' + authorId + ')',
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
});

// Show a particular abstact
server.route({
	method: 'GET',
	path: '/abstract/{id}',
	handler: function(request, reply) {
		const eid = encodeURIComponent(request.params.id);
		var options = getBasicOptions('https://api.elsevier.com/content/abstract/eid/' + eid);
		options.qs = {
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
	}
});

// Helper function that extracts the numeric portion of a Scopus EID.
handlebars.registerHelper('removeEIDPrefix', function(str) {
	var pos = str.lastIndexOf('-');
	return str.substring(pos+1);
});
// Helper function that adds spaces to camelcase strings
handlebars.registerHelper('camelCaseToString', function(str) {
	return str.split(/(?=[A-Z])/).join(' ');
});
// Helper function that does a logical if comparison
handlebars.registerHelper('ifEquals', function(arg1, arg2, options) {
    return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
});
numeralHelper.registerHelpers(handlebars);

/**
 * Get basic REST API options
 * @param {string} url - The base URL of the REST service to call.
 */
function getBasicOptions(url) {
	return {
		url: url,
		headers: {
			'Content-Type' : 'application/json',
			'X-ELS-APIKey' : config.api_key,
			'X-ELS-Insttoken' : config.inst_token
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