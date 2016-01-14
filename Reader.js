/*jslint browser: true */
/*global x, $, indexedDB, UUID, Promise, console */


var module = x.Base.clone({
        id          : "Reader",
        path 		: null,
        parts 		: null,
        page 		: null,
		all_repos 	: [
			"rsl-app-docs",
			"rsl-other-docs"
		],
		default_repo: "rsl-app-docs",
		all_links	: [],
		replicate   : true
    });

x.Reader = module;

module.define("start", function () {
	var that = this,
		path_array = this.getPathArray(this.queryParams().path);

	this.setPathDefaults(path_array);

	if (path_array.length > 0) {
		this.getDoc(this.getFullPath(path_array))
			.then(function (content) {
				that.convertAndDisplay("#main_pane", path_array, content);
				that.setCurrLocation("#curr_location", path_array, content);
			})
			.then(null, function (error) {
				$("#main_pane").html(error + " :-(");
			})
			.then(function () {
				that.discoverRepos();
				that.startReplication();
			});
	} else {
		alert("URL parameters 'repo' and 'page' expected!");
	}
});


module.define("splitParams", function (str) {
    var e,
        a = /\+/g,  // Regex for replacing addition symbol with a space
        r = /([^&=]+)=?([^&]*)/g,
        d = function (s) { return decodeURIComponent(s.replace(a, " ")); },
        q = str,
        out = {};
    e = r.exec(q);
    while (e) {
        out[d(e[1])] = d(e[2]);
        e = r.exec(q);
    }
    return out;
});


module.define("queryParams", function () {
    return this.splitParams(location.search.substring(1));
});


module.define("getPathArray", function (path_arg) {
	var i = 1,
		path_array = (path_arg || "").split("/");

	while (path_array.length > 0 && path_array[0] === "") {
		path_array.shift();
	}
	while (i < path_array.length) {
		if (path_array[i] === "..") {
			path_array.splice(i - 1, 2);
		} else {
			i += 1;
		}
	}
	this.trace("getPathArray(" + path_arg + "): " + path_array);
	return path_array;
});


module.define("setPathDefaults", function (path_array) {
	if (path_array.length == 0) {
		path_array.push(this.default_repo);
	}
	if (!path_array[path_array.length - 1].match(/\.md$/)) {
		path_array.push("README.md");
	}
	this.debug("setPathDefaults(): " + path_array);
});


module.define("getFullPath", function (path_array) {
	return path_array.join("/");
});


module.define("getFullDirectory", function (path_array) {
	var out = "",
		delim = "",
		i;

	for (i = 0; i < path_array.length - 1; i += 1) {
		out += delim + path_array[i];
		delim = "/";
	}
	return out;
});


module.define("convertAndDisplay", function (selector, path_array, content) {
	var that = this,
		dir  = this.getFullDirectory(path_array);

	$(selector).html(marked(content, { smartypants: true }));
	$(selector).find("table").addClass("table");			// style as TB tables
	$(selector).find("a[href]").each(function () {
		var href = $(this).attr("href");
		if (href.indexOf(":") === -1 && href.indexOf("/") !== 0) {	// protocol not specified, relative URL
			$(this).attr("href", "?path=" + dir + "/" + href);
		}
	});
	$(selector).find("img[src]").each(function () {
		var src = $(this).attr("src");
		if (src.indexOf(":") === -1 && src.indexOf("/") !== 0) {	// protocol not specified, relative URL
			$(this).attr("src", "../" + dir + "/" + src);
		}
	});
	$(selector).find("p").each(function () {
		if ($(this).text().indexOf("digraph") === 0) {
			that.applyViz(this, dir);
		}
	})
});


module.define("discoverRepos", function () {
	var i;
	for (i = 0; i < this.all_repos.length; i += 1) {
		this.checkRepo(this.all_repos[i]);
	}
});


module.define("checkRepo", function (repo) {
	this.debug("Checking: " + repo);
	$.ajax({ url: "../" + repo + "/README.md", type: "GET",
		success: function (data_back) {
			$("#menu_container").append("<li id='" + repo + "'><a href='?path=" + repo + "'>" + repo + "</a></li>");
		}
	});
});


module.define("applyViz", function (elmt, dir) {
	var text = $(elmt).text().replace("{", "{" +
	    " graph [ penwidth=0.5, bgcolor=transparent ]; " +
		" node  [ fontname=Arial, fontsize=10, shape=box, style=rounded ]; " +
		" edge  [ fontname=Arial, fontsize=10 ]; ");

	text = text.replace(/[“”]/g, "\"");			// marked replaces plain double-quotes with fancy ones...
	text = text.replace(/URL="(.*)"/g, "URL=\"?path=" + dir + "/$1\"");
	this.debug("applyViz(): " + text);
	$(elmt).html(Viz(text, "svg"));
});


module.define("setCurrLocation", function (selector, path_array, content) {
	var i,
		elmt = $(selector),
		title = this.getDocTitle(path_array, content),
		concat_path = "",
		page = path_array[path_array.length - 1];

	for (i = 0; i < path_array.length - 1; i += 1) {
		concat_path += path_array[i] + "/";
		this.addBreadcrumb(elmt, "?path=" + concat_path + "README.md", path_array[i]);
		// elmt = this.addUL(elmt);
		// elmt = this.addBulletLink(elmt, "?path=" + concat_path + "README.md", path_array[i]);
	}
	this.addBreadcrumb(elmt, "?path=" + concat_path + page, page, true);
	// elmt = this.addUL(elmt);
	// elmt = this.addBulletLink(elmt, "?path=" + concat_path + page, page);

	$(document).attr("title", title);
//    			document.title = page;
});


module.define("addUL", function (elmt) {
	return this.createAppend(elmt, "<ul></ul>");
});


module.define("addBulletLink", function (elmt, url, label) {
	return this.createAppend(elmt, "<li><a href='" + url + "'>" + label + "</a></li>");
});


module.define("addBreadcrumb", function (elmt, url, label, final_part) {
	if (final_part) {
		elmt.append("<li class='active'><a href='" + url + "'>" + label + "</a></li>");
	} else {
		elmt.append("<li><a href='" + url + "'>" + label + "</a> <span class='divider'>/</span></li>");
	}
});


module.define("createAppend", function (elmt, html_str) {
	var new_elmt = $(html_str);
	elmt.append(new_elmt);
	return new_elmt;
});



// Return a Promise
module.define("getDoc", function (path) {
	var that = this;
    return new Promise(function (resolve, reject) {
		$.ajax({ url: "../" + path, type: "GET", cache: false,
			success: function (content) {
				resolve(content);
			},
			error: function (xml_http_request, text_status) {
				reject("[" + xml_http_request.status + "] " + xml_http_request.statusText + " " + text_status);
			}
		});
	}).then(function (content) {
		// TODO need to check that file is markdown, or skip
		that.processRetrievedDoc(that.getPathArray(path), content);
		return content;
	});
});


module.define("wait", function (millis) {
    return new Promise(function (resolve, reject) {
    	setTimeout(function () {
    		resolve();
    	},
    	millis);
    });
});



module.define("processRetrievedDoc", function (path_array, content) {
	var path  = this.getFullPath(path_array),
		title = this.getDocTitle(path_array, content),
		links = this.getDocLinks(content);

	this.info("processRetrievedDoc(): doc title: " + title);
	this.info("processRetrievedDoc(): doc links: " + links);

	this.addKnownLinks(links, path_array);

	return x.Store.storeDoc("dox", {
		uuid    : path,
		payload : {
			title   : title,
			links   : links,
			content : content
		}
	}).then(function () {
		return content;
	});
});


module.define("getDocTitle", function (path_array, content) {
	var match = content.match(/^#\s*(.*)[\r\n]/);
	if (match) {
		return match[1];
	}
	return path_array[path_array.length - 1];
});


module.define("getDocLinks", function (content) {
    var regex = /\]\([\w\.\/]+\)/g,         // replace(regex, callback) doesn't seem to support capturing groups
        links = [];

    content.replace(regex, function (match) {
    	var url = match.substr(2, match.length - 3);
    	// TODO - need to validate that url is in the same domain
    	if (typeof url === "string" && url) {
	        links.push(url);
    	}
    });
    return links;
});


module.define("addKnownLinks", function (links, path_array) {
	var dir = this.getFullDirectory(path_array) + "/",
		i,
		link;

	for (i = 0; i < links.length; i += 1) {
		link = this.getFullPath(this.getPathArray(dir + links[i]));
		if (this.all_links.indexOf(link) === -1) {
			this.all_links.push(link);
		}
	}
});


module.define("startReplication", function () {
	this.getUnstoredDoc(0);
});


module.define("getUnstoredDoc", function (i) {
	var that = this;
	if (!this.replicate) {
		return;
	}
	if (i + 1 >= this.all_links.length) {
		return this.getOldestDoc();
	}
	this.info("getting unstored doc " + i + ", " + this.all_links[i]);
	this.getDoc(this.all_links[i])
		.then(null, function (error) {
			that.error(error);
		})
		.then(function () {
			return that.wait(5000);
		})
		.then(function () {
			return that.getUnstoredDoc(i + 1);
		});
});


module.define("getOldestDoc", function () {
	this.info("getOldestDoc()");
	// TODO - find oldest doc and get a new copy, wait, and then do it again
});



module.define("searchSetup", function (selector) {
	var that = this;
	this.debug("searchSetup(): " + selector);
    $(selector).typeahead({
        minLength: 4,        // min chars typed to trigger typeahead
        items    : 20,
        source : function (query, process) { return that.searchSource (query, process); },
        updater: function (item) { return that.searchUpdater(item); }
    });
});


// use query <string> to make an array of match results and then call process(results)
module.define("searchSource", function (query, process) {
	var that = this,
		regex = new RegExp(".*" + query + ".*", "gi");			// danger? for the mo, treat query as a regex expr...

	this.debug("searchSource(): " + query);
	this.search_map = {};			// map search result <string>s to doc paths
	x.Store.getAllDocs("dox")
		.then(function (docs) {
			var results   = [],
				i;

			that.debug("searchSource() starting to match docs: " + docs.length);
			function addMatch(match_text, index) {
				results.push(match_text);
				that.search_map[match_text] = docs[index].uuid;
			}
			for (i = 0; i < docs.length; i += 1) {
				if (docs[i].payload && regex.exec(docs[i].payload.title)) {
					addMatch(docs[i].payload.title, i);
				}
			}
			for (i = 0; i < docs.length; i += 1) {
				if (docs[i].payload && typeof docs[i].payload.content === "string") {
					docs[i].payload.content.replace(regex, function (match) {
						addMatch(docs[i].payload.title + ": " + match, i);
					});
				}
			}
			that.debug("searchSource() sending results: " + results.length);
			process(results);
		});
});

// do something when item <string> is selected in the typeahead
module.define("searchUpdater", function (item) {
	this.info("searchUpdater(): " + item + " maps to: " + this.search_map[item]);
	window.location = "?path=" + this.search_map[item];
});