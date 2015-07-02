/*
 *
 * Basic Sequencer.
 * Built by Hugh Zabriskie.
 *
 */

Sequencer = function (_tempo) {
	tempo = _tempo; 		// global tempo
	TRACKS = []; 			// global track container
	PLAYTRACKS = [];		// global list of playing tracks
	DISPLAYTRACKS = [];		// the subset of TRACKS displayed
	loopOn = false; 		// is event loop running?
	buildingSection = null;	// currently defining this section
	showSection = null;		// section displayed in the track table
	measureStart = 0.0; 	// store most recent measure start time
	
	this.table = document.getElementById("tracks-table");
	this.instructions = document.getElementById("instructions");
	this.message = document.getElementById("message");

	this.init();
};

Sequencer.prototype.init = function () {

	var that = this;
	
	// set audio context and check API is functional
	try {
		AudioContext = window.AudioContext || window.webkitAudioContext;
		globalContext = new AudioContext(); // global
	} catch (e) {
		alert("Web Audio API is not supported in this browser");
		return;
	}
	
	// stores all buffer objects
	BUFFERS = new Object();
	
	// drums
	this.DRUMS = [
		'kick',
		'ekick',
		'dry-kick',
		'boom-kick',
		'zill',
		'gong',
		'ride',
		'ride-2',
		'hihat',
		'hihat-3',
		'ohihat',
		'ohihat-2',
		'cross',
		'snare',
		'crash',
		'crash-2',
		'crash-3'
	];

	this.DRUMPATHS = this.DRUMS.map(function (d) { return "/drums/" + d + ".wav"; });

	
	// custom class for loading multiple sound clips
	// thanks to Boris Smus (http://www.html5rocks.com/en/tutorials/webaudio/intro/js/buffer-loader.js)
	this.drumLoader = new BufferLoader(
		globalContext,
		this.DRUMPATHS,
		function (bufferList) {
			BUFFERS.drums = new Object();
			for (var index in that.DRUMS)
				BUFFERS.drums[that.DRUMS[index]] = bufferList[index];
		});
	this.drumLoader.load();


	
	// piano filenames
	// Retrieved from http://pianosounds.pixelass.com/tones/grand-piano/6Cs.mp3
	// See script folder for how to download all of the mp3s
	// See http://www.html5piano.ilinov.eu/full/ for another working example with these sounds.
	this.PIANO = [
		'0A', '0As', '0B', '0C', '0Cs', '0D', '0Ds', '0E', '0F', '0Fs', '0G', '0Gs',
		'1A', '1As', '1B', '1C', '1Cs', '1D', '1Ds', '1E', '1F', '1Fs', '1G', '1Gs',
		'2A', '2As', '2B', '2C', '2Cs', '2D', '2Ds', '2E', '2F', '2Fs', '2G', '2Gs',
		'3A', '3As', '3B', '3C', '3Cs', '3D', '3Ds', '3E', '3F', '3Fs', '3G', '3Gs',
		'4A', '4As', '4B', '4C', '4Cs', '4D', '4Ds', '4E', '4F', '4Fs', '4G', '4Gs',
		'5A', '5As', '5B', '5C', '5Cs', '5D', '5Ds', '5E', '5F', '5Fs', '5G', '5Gs',
		'6A', '6As', '6B', '6C', '6Cs', '6D', '6Ds', '6E', '6F', '6Fs', '6G', '6Gs',
		'7C'
	];
	
	this.PIANOPATHS = this.PIANO.map(function (d) { return "/piano/" + d + ".mp3"; });
	
	this.pianoLoader = new BufferLoader(
		globalContext,
		this.PIANOPATHS,
		function (bufferList) {
			BUFFERS.piano = new Object();
			for (var index in that.PIANO)
				BUFFERS.piano[that.PIANO[index]] = bufferList[index];
		});
	this.pianoLoader.load();
	
	
	// acoustic guitar files
	this.AGTR = this.PIANO.slice(
		this.PIANO.indexOf('3C'),
		this.PIANO.indexOf('6C')
		);
	
	this.AGTRPATHS = this.AGTR.map(function (d) { return "/agtr/" + d + ".mp3"; });
	
	this.agtrLoader = new BufferLoader(
		globalContext,
		this.AGTRPATHS,
		function (bufferList) {
			BUFFERS.agtr = new Object();
			for (var index in that.AGTR)
				BUFFERS.agtr[that.AGTR[index]] = bufferList[index];
		});
	this.agtrLoader.load();
	
	
	// show terminal line when done loading 
	window.onload = function () {
		document.getElementsByClassName('container')[0].style.display = "block";
	};
	
	// set global types
	TYPES = this.DRUMS.concat(["piano", "monosynth", "agtr"]);
	
};




Sequencer.prototype.evaluateCommand = function (c) {
	this.tokens = c.split(" ");

	// evalutate on first command
	if (this.tokens[0] === "add") return this.addLayer();
	if (this.tokens[0] === "rm") return this.removeLayer();
	if (this.tokens[0] === "tempo") return this.setTempo();
	if (this.tokens[0] === "play") return this.play();
	if (this.tokens[0] === "stop") return this.stopAll();
	if (this.tokens[0] === "pause") return this.pause();
	if (this.tokens[0] === "show") return this.show();
	if (this.tokens[0] === "hide") return this.hide();
	if (this.tokens[0] === "define") return this.define();

	return this.onError(this.tokens[0] + " is not a command.");
};



Sequencer.prototype.addLayer = function () {
	if (this.tokens[1] === undefined)
		this.onError("No instrument defined. Try: add snare on 1 2 4");

	else if (this.tokens[1].indexOf("(") > 0 && this.tokens[1].indexOf(")") > 0)
		this.addMelodicInput();

	else if (this.DRUMS.indexOf(this.tokens[1]) < 0)
		this.onError("No instrument exists with the name: '" + this.tokens[1] + "'.");

	else if (this.tokens[2] === undefined)
		this.onError("No rhythmic pattern specified.");

	else {
		// rhythmic input
		var newTrack = new Drum(this.tokens);
		if (newTrack.error)
			return this.onError(newTrack.error);
		TRACKS.push(newTrack);
	}
	this.update();
};



Sequencer.prototype.addMelodicInput = function () {
	var newTrack = null;
	if (this.tokens[1].indexOf("monosynth") === 0) newTrack = new Synth(this.tokens);
	if (this.tokens[1].indexOf("piano") === 0) newTrack = new Piano(this.tokens);
	if (this.tokens[1].indexOf("generator") === 0) newTrack = new Generator(this.tokens);
	if (!newTrack)
		return this.onError("Unable to identify an instrument.");
	if (newTrack.error)
		return this.onError(newTrack.error);
	TRACKS.push(newTrack);
};




Sequencer.prototype.removeLayer = function () {
	var that = this;
	
	// remove all (cmd: rm)
	if (this.tokens[1] === undefined) {
		for (var track in TRACKS) TRACKS[track].stop();
		TRACKS = [];
	} 
	
	// remove most recent (cmd: rm last)
	else if (this.tokens[1] === "last") { // remove most recently added track
		TRACKS[TRACKS.length - 1].stop();
		TRACKS.pop();
	} 
	
	// remove by index (cmd: rm 5)
	else if (!isNaN(this.tokens[1])) {
		var index = parseInt(this.tokens[1]);
		if (index < 0 || index >= TRACKS.length)
			return this.onError("rm : Invalid index argument.");
		TRACKS.splice(index, 1);
	}
	
	// remove by section (cmd: rm A)
	else if (sectionExists(this.tokens[1])) {
		var section = this.tokens[1].toUpperCase();
		TRACKS = TRACKS.filter(function (d) {
			var keepIt = true;
			if (_.contains(d.sections, section)) {
				d.stop();
				keepIt = false;
			}
			return keepIt;
		});
	}
	
	// remove by type (cmd: rm snare)
	else if (typeExists(this.tokens[1])) {
		TRACKS = TRACKS.filter(function (d) {
			var keepIt = true;
			if (d.type === that.tokens[1]) {
				d.stop();
				keepIt = false;
			}
			return keepIt;
		});
	}
	
	// else fail
	else {
		return this.onError("rm: Invalid argument.");
	}

	this.update();
};



// this is where the sequencing happens
Sequencer.prototype.eventLoop = function () {
	measureStart = globalContext.currentTime;
	// go through stack of tracks and press play on each one
	for (var index in PLAYTRACKS)
		PLAYTRACKS[index].playBar();
};




Sequencer.prototype.setTempo = function () {
	var that = this;
	var newT = this.tokens[1];

	if (newT === undefined)
		return this.onError("You must specify a tempo between 60 and 240.");

	newT = parseInt(newT);
	if (newT < 16)
		return this.onError("The lowest recognized tempo is 16 bpm.");

	var oldTempo = tempo;
	tempo = newT;
	for (var i in TRACKS)
		TRACKS[i].init();

	if (loopOn) {
		this.pause();
		this.tokens = []; // flush tokens
		var waitTime = (measureStart + (60 / oldTempo * 4) - globalContext.currentTime) * 1000;
		setTimeout(function () { that.play(); }, waitTime);
	}
};




// Start tracks - synchronized calls to eventLoop
// TODO: fix tempo issue. add a track, play, set tempo or play then set tempo
Sequencer.prototype.play = function (isUpdate) {

	if (!isUpdate)
		this.lastPlayCommand = this.tokens[1];
	
	// "play", "play all"
	if (this.lastPlayCommand === undefined)
		PLAYTRACKS = TRACKS;
	else {
		// "play <sections>"
		var tracks = evaluateSectionEquation(this.lastPlayCommand);
		if (!tracks)
			return this.onError("At least one specified section does not exist.");
		PLAYTRACKS = tracks;
	}
	
	// start the loop
	if (!loopOn) {
		this.eventLoop();
		this.interval = setInterval(this.eventLoop, 60 / tempo * 4000);
		loopOn = true;
	}
};




// Clear tracks and end event loop.
Sequencer.prototype.stopAll = function () {
	for (var t in TRACKS)
		TRACKS[t].stop();
	TRACKS = [];
	updateDisplay();
	this.pause();
};




// Pause loop
Sequencer.prototype.pause = function () {
	for (var t in TRACKS)
		TRACKS[t].pause();
	clearInterval(this.interval);
	loopOn = false;
};




// show tracks
Sequencer.prototype.show = function () {
	// display the instructions page
	if (this.tokens[1] === "instructions")
		show(this.instructions);	
	
	// display all tracks
	else if (this.tokens[1] === "all" || this.tokens[1] === undefined) {
		showSection = null;
		updateDisplay();
		show(this.table, "table");
	} 
	
	// display the section (if it exists)
	else {
		var section = this.tokens[1].toUpperCase();
		if (sectionExists(section))
			showSection = section;
		else
			return this.onError("No section exists called " + section);
		updateDisplay();
	}
};




// hide tracks
Sequencer.prototype.hide = function () {
	if (this.tokens[1] === "instructions")
		hide(this.instructions);
	else
		hide(this.table);
};




Sequencer.prototype.define = function () {
	if (this.tokens[1] === undefined)
		return this.onError("Define what? Specify a section.");
	else {
		var newSection = this.tokens[1].toUpperCase();
		// define end
		if (newSection === "END")
			buildingSection = null;
		
		// define <sectionEquation>
		else if (newSection.indexOf("=") !== -1) {
			// TODO: check that only one equals sign exists
			var components = newSection.split("=");
			var newSection = components[0];
			var tracks = evaluateSectionEquation(trimWhiteSpace(components[1]));
			TRACKS.map(function (d) {
				if (_.contains(tracks, d))
					d.sections.push(newSection);
				return d;
			});
			updateDisplay();
			return this.onInfo("Section " + newSection + " is now defined.");
		}
		
		// ensure the section does not have reserved symbols
		else if (newSection.indexOf("+") !== -1 ||
			newSection.indexOf("-") !== -1) {
			return this.onError("Invalid section name.");
		} 
		
		//
		else
			buildingSection = newSection;
	}

	if (buildingSection)
		this.onInfo("Defining section " + buildingSection);
	else
		this.onInfo("Back to master...");
};




Sequencer.prototype.update = function () {
	updateDisplay();
	// if it's already looping, generate a new play command to update PLAYTRACKS
	if (loopOn)
		this.play(true);
};



// TODO: make this different than onError?
Sequencer.prototype.onInfo = function (reason) {
	this.onError(reason);
};



Sequencer.prototype.onError = function (reason) {
	this.message.innerHTML = "<code>" + reason + "</code>";
	show(this.message);
};