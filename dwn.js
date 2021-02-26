/**
 * Library to bundle all calculations around blood glucose, insulin and meals 
 * for type 1 diabetes. This code is designed to explain concepts not to make
 * dosing decsions. There are several decsions to make concepts more visible
 * that make the tool unsuitabl to guide dosing decisions.
 * 
 * Currently written in ECMA6 may have to transpile for older browsers
 * @Author Lars Mueller <lamueller@ucsd.edu>
 */

"use strict";

const SETTINGS = {
    isf: 30,
    carb_ratio: 10,
    zoom: 10
}

const INSULIN_TYPE = {
    "RAPID": { PEAK: 80, DURATION: 300, ONSET: 15 },  // e.g. humalog
}

const MEAL_COMPONENTS = {
    "SIMPLE_CARB": { PEAK: 30, DURATION: 200, ONSET: 0, NAME: "SIMPLE CARB" },  // e.g. sugar
    "COMPLEX_CARB": { PEAK: 60, DURATION: 300, ONSET: 0, NAME: "COMPLEX CARB" }
}

/**
 * Model class. Represents the glucose and carb data for a defined timespan
 *
 * @constructor
 * @param {Number} dose         - The amount of Insulin in Units
 * @param {Number} bolus_time   - The time of the bolus in minutes
 * @param {INSULIN_TYPE} type      - The type of insulin
 */
class Model {
    factors = [];
    bgbase = [];
    zero_base = [];
    constructor(from, to) {
        this.start;
        this.factors = [];
        this.sampling = 5
        d3.timeMinutes(from, to, this.sampling).forEach(x_val => {
            this.bgbase.push({ "x": x_val, "y": 100 })
        });
        d3.timeMinutes(from, to, this.sampling).forEach(x_val => {
            this.zero_base.push({ "x": x_val, "y0": 0, "y1": 0 })
        });
    }
    loadJSON(json_object, sampling) {
        this.bgbase = [];
        this.sampling = 5;
        let timeParse = d3.timeParse("%H:%M:%S")

        json_object.forEach(d => {
            this.bgbase.push({ "x": timeParse(d[0]), "y": d[1] });
        })
    }
    addFactor(factor) {
        this.factors.push(factor)
    }

    removeFactor(factor) {
        this.factors = this.factors.filter(function (included) {
            return !(included === factor);
        });
    }
    /*
    * Returns the current carb curve for all carbs added before this one
    * 
    */
    getShapeOf(curr_factor = None) {
        let result = deep_copy(this.zero_base);
        for (let i = 0; i < result.length; i++) {
            var searching = true;
            for (let factor of this.factors) {
                if (searching) {
                    if (curr_factor.constructor === factor.constructor) {

                        //stop if we added this meal
                        if (factor === curr_factor) {
                            result[i].y1 = result[i].y0 + factor.getActivityAt(result[i].x);
                            searching = false;
                        } else {
                            result[i].y0 = result[i].y0 + factor.getActivityAt(result[i].x);
                        }
                    }
                }
            }

        }
        return result;
    }
    getDependentFactors(curr_factor) {
        let dependent = [];
        var found = false;
        this.factors.forEach(factor => {
            if (curr_factor.constructor === factor.constructor) {
                if (found) {
                    dependent.push(factor);
                }
                if (curr_factor === factor) {
                    found = true;
                }
            }
        });
        return dependent;
    }

    getYHandleOf(curr_factor) {
        let x_val = curr_factor.getYHandleTime();
        let y_val = 0;
        this.factors.forEach(factor => {
            if (curr_factor.constructor === factor.constructor) {
                //stop if we added this meal
                if (factor === curr_factor) {
                    y_val = y_val + factor.getActivityAt(x_val);
                    return { x: x_val, y: y_val }
                } else {
                    y_val = y_val + factor.getActivityAt(x_val);
                }
            }
        });
        return { x: x_val, y: y_val };
    }

    /*
    * Returns the current bg curve
    */
    getBG() {
        let result = deep_copy(this.bgbase);
        let last_change = 0
        for (let i = 0; i < result.length; i++) {
            if (i > 0) {
                last_change = this.bgbase[i].y - this.bgbase[i - 1].y;
                result[i].y = result[i - 1].y + last_change;

            }
            this.factors.forEach(factor => {
                result[i].y = factor.apply(result[i].y, result[i].x);
            });

        }
        return result;
    }

    timeInRange() {
        let bg_data = this.getShape();
        var inrange = 0;
        for (i = 0; i < bg_data.length; i++) {
            if (bg_data[i].y > 69 && bg_data[i].y < 181) {
                inrange++;
            }
        }
        return Math.round(inrange / bg_data.length * 100);
    }
    getTimeRange() {
        return d3.extent(this.bgbase, function (d) { return d.x; });
    }
    setChart(chart) {
        this.chart = chart;
    }
}

/**
 * Factor class the base class for meal and insulin (maybe exercise in the future)
 * @constructor
 * @param {Date} time - the time this factor was applied
 * @param {Number} amount - the amount of insulin or carbs 
 * @param {Object} type - the type of insulin or carbs 
 * 
 */
class Factor {
    constructor(time, amount, type) {
        this.time = time;
        this.default_time = time; //used to move things relatively to a start time
        this.amount = amount;
        this.uuid = uuidv4();
        this.type = type;
    }
    /**
     * returns activity curve at a point in time
     * @param {Number} sampling - Sampling interval for the curve in minutes
     * @return {Array} - 2-dimensional array with timestamps and values
     **/
    // getShape(sampling = 5) {
    //     let curve = [];
    //     for (let min = 0; min < this.type.DURATION; min += sampling) {
    //         curve.push({ x: d3.timeMinute.offset(this.time, min), y: this.getActivity(min) });
    //     }
    //     return curve;
    // }

    /**
     * returns activity at a point in time
     * @param {Object} time - absolute time on the graph 
     * @return {Number} - value of activity at tht point
     **/
    getActivityAt(time) {
        let minutes = (time - this.time) / (60 * 1000);
        if ((minutes < 0) | minutes > this.type.DURATION) {
            return 0
        } else {
            return this.getActivity(minutes)
        }
    }

    /**
    * set the time of the bolus
    * @param {Object} bolus_time - Time of the bolus d3 date object
    * @return {Insulin} - the current object to allow chaining of methods
    **/
    setTime(time) {
        let old_time = this.time;
        let minute_change = (time - old_time) / 10000 //(60 - 1000)
        //notify listeners?
        if (this.notifyTime) {
            console.log("trying")
            this.notifyTime(time, minute_change);
        }
        this.time = time;
        this.updateGraph()
        return this;
    }
    /**
     * add listener to minute changes
     * @param {Method} method
     */
    onTimeChange(method) {
        this.notifyTime = method
    }

    /**
    * add listener to amount changes
    * @param {Method} method
    */
    onAmountChange(method) {
        this.notifyAmount = method
    }

    /**
    * set the time of the factor
    * @param {Number} minute - Minute offset for this factor
    * @return {Factor} - the current object to allow chaining of methods
    **/
    changeTimeByMinute(minute) {
        this.time = d3.timeMinute.offset(this.default_time, minute)
        if (this.notifyTime) {
            this.notifyTime(this.time, minute);
        }
        this.updateGraph();
        return this;
    }

    /**
    * get the time of the bolus
    * @return {Object} - Time of the bolus d3 date object
    **/
    getTime() {
        return this.time;
    }

    /**
    * set/change the amount
    * @param {Number} dose - The new amount
    * @return {Insulin} - the current object to allow chaining of methods
    **/
    setAmount(amount) {
        let change = amount - this.amount;
        this.amount = amount;
        if (this.notifyAmount) {
            this.notifyAmount(amount, change);
        }
        this.updateGraph()
        return this;
    }

    /**
    * get the amount of insulin
    * @return {Number} dose - The dose of this insulin bolus
    **/
    getAmount() {
        return this.amount;
    }

    getUUID() {
        return this.uuid;
    }
    setChart(chart) {
        this.chart = chart
    }
    getYHandleTime() {
        return d3.timeMinute.offset(this.time, this.type.PEAK)
    }
}


/**
 * Insulin class. Represents one bolus with:
 *
 * @constructor
 * @param {Number} dose         - The amount of Insulin in Units
 * @param {Object} bolus_time   - The time of the bolus 
 * @param {INSULIN_TYPE} type      - The type of insulin
 */
class Insulin extends Factor {
    constructor(dose, bolus_time, type) {
        super(bolus_time, dose, type);
    }
    /** 
    * Return insulin effect at a point in time
    *
    * @param {Object} time - Minutes since bolus
    * Code adapted from https://github.com/openaps/oref0/blob/master/lib/iob/calculate.js inspired by 
    * https://github.com/LoopKit/Loop/issues/388#issuecomment-317938473
    **/
    apply(bg, time) {
        let minutes = (time - this.time) / (60 * 1000);
        if ((minutes < 0) | minutes > this.type.DURATION) {
            return bg
        } else {
            return bg - this.getActivity(minutes) / SETTINGS.zoom
        }
    }

    /** 
    * Return active insulin at a point in time
    *
    * @param {Number} time - Minutes since bolus
    * Code adapted from https://github.com/openaps/oref0/blob/master/lib/iob/calculate.js inspired by 
    * https://github.com/LoopKit/Loop/issues/388#issuecomment-317938473
    **/
    getActivity(time) {
        let end = this.type.DURATION - this.type.ONSET;
        let peak = this.type.PEAK - this.type.ONSET;

        if (time < this.type.ONSET) {
            return 0; //ugly can we find a function with a nice slow start?
        }
        if (time > this.end) {
            return 0;
        }
        let minsAgo = time - this.type.ONSET;
        let insulin = this.amount;//*SETTINGS.zoom;

        let tau = peak * (1 - peak / end) / (1 - 2 * peak / end);  // time constant of exponential decay
        let a = 2 * tau / end;                                     // rise time factor
        let S = 1 / (1 - a + (1 + a) * Math.exp(-end / tau));      // auxiliary scale factor

        var activityContrib = insulin * (S / Math.pow(tau, 2)) * minsAgo * (1 - minsAgo / end) * Math.exp(-minsAgo / tau);
        return activityContrib * SETTINGS.isf
    }

    updateGraph() {
        if (this.chart) {
            this.chart.updateFactor(this);
        }
    }
}



/**
 * Meal class. Represents one meal:
 *
 * @constructor
 * @param {Number} carbs     - The amount of carbs
 * @param {Object} meal_time  - The time of the meal in minutes
 */
class Meal extends Factor {
    constructor(carbs, meal_time, type) {
        super(meal_time, carbs, type);
    }

    /** 
    * Return insulin effect at a point in time
    *
    * @param {Object} time - Minutes since bolus
    * Code adapted from https://github.com/openaps/oref0/blob/master/lib/iob/calculate.js inspired by 
    * https://github.com/LoopKit/Loop/issues/388#issuecomment-317938473
    **/
    apply(bg, time) {
        let minutes = (time - this.time) / (60 * 1000);
        if (minutes < 0 | minutes > this.type.DURATION) {
            return bg
        } else {
            return bg + this.getActivity(minutes) / SETTINGS.zoom
        }
    }
    getName() {
        return this.name;
    }
    /** 
    * Return digested carbs at a point in time
    *
    * @param {Number} time - Minutes since meal
    * Code adapted from https://github.com/openaps/oref0/blob/master/lib/iob/calculate.js inspired by 
    * https://github.com/LoopKit/Loop/issues/388#issuecomment-317938473
    **/
    getActivity(time) {
        let end = this.type.DURATION - this.type.ONSET;
        let peak = this.type.PEAK - this.type.ONSET;

        if (time < this.type.ONSET) {
            return 0; //ugly can we find a function with a nice slow start?
        }
        if (time > this.end) {
            return 0;
        }
        let minsAgo = time - this.type.ONSET;
        let insulin = this.amount;//*SETTINGS.zoom;

        let tau = peak * (1 - peak / end) / (1 - 2 * peak / end);  // time constant of exponential decay
        let a = 2 * tau / end;                                     // rise time factor
        let S = 1 / (1 - a + (1 + a) * Math.exp(-end / tau));      // auxiliary scale factor

        var activityContrib = insulin * (S / Math.pow(tau, 2)) * minsAgo * (1 - minsAgo / end) * Math.exp(-minsAgo / tau);
        return activityContrib * SETTINGS.isf
    }
    updateGraph() {
        if (this.chart) {
            this.chart.updateFactor(this);
        }
    }
}

/**
 * Helper Function for wrapping text
 * https://stackoverflow.com/questions/24784302/wrapping-text-in-d3
 * @param {} text 
 * @param {*} width 
 */
function wrap(text, width) {
    text.each(function () {
        var text = d3.select(this),
            words = text.text().split(/\s+/).reverse(),
            word,
            line = [],
            lineNumber = 0,
            lineHeight = 1.1, // ems
            x = text.attr("x"),
            y = text.attr("y"),
            dy = 0, //parseFloat(text.attr("dy")),
            tspan = text.text(null)
                .append("tspan")
                .attr("x", x)
                .attr("y", y)
                .attr("dy", dy + "em");
        while (word = words.pop()) {
            line.push(word);
            tspan.text(line.join(" "));
            if (tspan.node().getComputedTextLength() > width) {
                line.pop();
                tspan.text(line.join(" "));
                line = [word];
                tspan = text.append("tspan")
                    .attr("x", x)
                    .attr("y", y)
                    .attr("dy", ++lineNumber * lineHeight + dy + "em")
                    .text(word);
            }
        }
    });
}


/**
 * Chart class that handles all drawing using d3.
 * @constructor
 * @param {Element} svg - target svg element we going to draw into
 * @param {Array} timerange - array consisting of start and end time as Date objects
 * @param {Array} targetRange  - array indicating the upper and lower limit for time in range 
 */
class Chart {
    margin = { top: 20, right: 20, bottom: 30, left: 50 };

    constructor(svg, model, targetRange = [70, 180]) {
        this.svg = d3.select(svg); //select target
        this.model = model;
        this.width = this.svg.attr("width") - this.margin.left - this.margin.right;
        this.height = this.svg.attr("height") - this.margin.top - this.margin.bottom;
        this.targetRange = model.getTimeRange();

        this.x = d3.scaleTime().range([0, this.width]).clamp(true);
        this.y = d3.scaleLinear().domain([0, 400])
            .rangeRound([this.height, 0]).clamp(true);
        this.y.domain([0, 400]);
        this.x.domain(this.targetRange);

        this.drawBase(this.svg);
        this.drawToolTip(this.svg);
    }

    drawToolTip(svg, hoverObj) {
        let tooltip = svg.append("g");
        let rectData = {
            height: 100,
            width: 300,
            x: 380,
            y: 10,
            rx: 30
        };

        // Background
        tooltip.append("rect")
            .style("fill", "white")
            .style("stroke", "black")
            .attr("x", rectData.x)
            .attr("y", rectData.y)
            .attr("width", rectData.width)
            .attr("height", rectData.height)
            .attr("rx", rectData.rx);

        // Text
        tooltip.append("text").text("You can display information here")
            .attr("x", rectData.x + 30)
            .attr("y", rectData.y + 30)
            .attr("visibility", "visible")
            .attr("id", "tooltip-text")
            .call(wrap, 250);
    }

    drawTargetRange(range = this.targetRange) {
        let targetRangeGroup = this.graphArea.append('g').attr("class", "range");
        let rect = {
            x1: 0,
            x2: this.width,
            y1: this.y(range[0]),
            y2: this.y(range[1]),
        };
        // shade time in range section
        targetRangeGroup.append('rect')
            .style("fill", "#EFF6FE")
            .attr("x", rect.x1)
            .attr("y", rect.y2)
            .attr("width", rect.x2)
            .attr("height", rect.y1 - rect.y2);

        //line lower threshold
        targetRangeGroup.append('line')
            .style("stroke", "#EB8690")
            .style("stroke-dasharray", ("3, 5"))
            .style("stroke-width", 2)
            .attr("x1", rect.x1)
            .attr("y1", rect.y1)
            .attr("x2", rect.x2)
            .attr("y2", rect.y1);

        //line upper threshold
        targetRangeGroup.append('line')
            .style("stroke", "#EB8690")
            .style("stroke-dasharray", ("3, 5"))
            .style("stroke-width", 2)
            .attr("x1", rect.x1)
            .attr("y1", rect.y2)
            .attr("x2", rect.x2)
            .attr("y2", rect.y2);
    }

    drawBase(svg) {
        this.graphArea = svg.append("g")
            .attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")");

        this.drawTargetRange();

        // glucose label
        this.svg.append("text")
            .attr("transform", `translate(${this.margin.right / 2},${this.y(100)}) rotate(-90)`)
            .attr("class", "range") // use to style in stylesheet
            .text("Glucose Response");

        let xAxis = d3.axisBottom(this.x);
        let yAxis = d3.axisLeft(this.y).tickSize(0).tickValues([]);

        this.graphArea.append('g')
            .attr('class', 'axis axis--x')
            .attr('transform', 'translate(0,' + this.height + ')')
            .call(xAxis);

        this.graphArea.append('g')
            .attr('class', 'axis axis--y')
            .call(yAxis);
    }


    drawBG(bg) {
        this.bg = bg;
        bg.setChart(this);
        this.removeBG();  //clean up before we start
        let g = this.graphArea.append("g").attr("class", "bg_curve");

        // BG graph
        g.selectAll('circle')
            .data(bg.getBG())
            .enter()
            .append('circle')
            .attr('r', 3.0)
            //.style('cursor', 'pointer')
            .style('fill', '#000000'); // glucose curve color
        this.updateBG(bg);
    }

    updateBG(bg) {
        this.graphArea.select(".bg_curve").selectAll('circle')
            .data(bg.getBG())
            .attr('cx', (d) => { return this.x(d.x); })
            .attr('cy', (d) => { return this.y(d.y); });
    }
    removeBG() {
        this.graphArea.selectAll(".bg_curve").remove();
    }

    drawMeal(meal) {
        meal.setChart(this);
        this.removeFactor(meal); //clean up

        let g = this.graphArea.append("g").attr("class", "curve" + meal.getUUID());

        g.append("path")
            .datum(this.model.getShapeOf(meal))
            .attr("class", "area")
            .attr("fill", "#41FF8E")
            .attr("fill-opacity", "0.5")
            .attr("stroke", "#41948E") // insulin curve color
            .attr("stroke-width", 0) // size(stroke) of the insulin curve
            .call(d3.drag()
                .on('drag', (d, a, b, factor = meal) => { this.dragX(d, factor); }));

        this.drawMarker(g, "Meal", meal, "I am a meal");
        this.updateFactor(meal);
    }

    drawMarker(g, name, factor, toolTipText = "fix me") {

        //  vertical line
        g.append('line')
            .style("stroke", "#C4c4c4") // color of meal line
            .style("stroke-dasharray", ("3, 5"))
            .style("stroke-width", 2);
        // point
        g.append("circle")
            .attr("r", 5)
            .style("fill", "black");
        // text
        g.append("text")
            .attr("class", "range") // use to style in stylesheet
            .text(name);

        //yhandle
        let handle = this.model.getYHandleOf(factor);

        let draggable_eclipse = g.append("svg")
        //.attr("fill", "none");


        draggable_eclipse.append("ellipse")
            .style("fill", "#285C58")
            .attr("cx", this.x(handle.x))
            .attr("cy", this.y(handle.y))
            .attr("rx", 13)
            .attr("ry", 15)
            .style("fill", "url(#arrow)")
           // .style('cursor', 'pointer')
            .on("mouseover", function (d, i) {
                d3.select("#tooltip-text")
                    .text(toolTipText)
                    .call(wrap, 270);;
            })
            .call(d3.drag()
                .on('drag',
                    (d, a, b, factor_param = factor) => {
                        this.dragY(d, factor_param);
                    }));
        draggable_eclipse.append("pattern")
        .attr("id", "arrow")
        .attr("class", "svg-image")
        .attr("x", "0")
        .attr("y", "0")
        .attr("height", "1")
        .attr("width", "1")
        .append("svg:image")
            .attr("x", "0")
            .attr("y", "0")
            .attr('width', 26)
            .attr('height', 30)
            .attr("xlink:href", "doublearrow.png")

    }
    updateMarker(g, factor) {
        // bolus point
        g.select("circle")
            .attr("cx", this.x(factor.getTime()))
            .attr("cy", this.y(0));

        //bolus vertical line
        g.select('line')
            .attr("x1", this.x(factor.getTime()))
            .attr("y1", this.y(0))
            .attr("x2", this.x(factor.getTime()))
            .attr("y2", this.y(400));

        // bolus text
        g.select("text")
            .attr("x", this.x(factor.getTime()))
            .attr("y", this.y(5));
        //handle
        let handle = this.model.getYHandleOf(factor);
        g.select("ellipse") // TODO: Replace w/ SVG of draggable
            .attr("cx", this.x(handle.x))
            .attr("cy", this.y(handle.y))

    }

    drawInsulin(insulin, stroke_color = "#944141", fill_color = "#944141") {
        insulin.setChart(this);
        this.removeFactor(insulin);
        //  this.graphArea.selectAll(".curve" + insulin.getUUID()).remove();
        let g = this.graphArea.append("g").attr("class", "curve" + insulin.getUUID());

        // insulin curve
        g.append("path")
            .datum(this.model.getShapeOf(insulin))
            .attr("fill", fill_color)
            .attr("fill-opacity", "0.5")
            .attr("stroke", stroke_color) // insulin curve color
            .attr("stroke-width", 0) // size(stroke) of the insulin curve
            .call(d3.drag()
                .on('drag', (d, a, b, factor = insulin) => { this.dragX(d, factor); }));

        this.drawMarker(g, "Bolus", insulin, "I am insulin");

        this.updateFactor(insulin);
    }
    updateCurve(g, factor) {
        g.selectAll("path")
            .datum(this.model.getShapeOf(factor))
            .attr("d", d3.area()
                .x((d) => { return this.x(d.x); })
                .y0((d) => { return this.y(d.y0); })
                .y1((d) => { return this.y(d.y1); })
            );


    }
    updateFactor(factor) {
        //update this graph
        let g = this.graphArea.selectAll(".curve" + factor.getUUID());
        this.updateCurve(g, factor);
        this.updateMarker(g, factor);

        //update all dependent graphs
        this.model.getDependentFactors(factor).forEach(dep => {
            this.updateFactor(dep);
        });


    }
    removeFactor(factor) {
        this.graphArea.selectAll(".curve" + factor.getUUID()).remove();
    }
    dragX(d, factor) {
        let old_time = factor.getTime()
        let new_time = this.x.invert(this.x(old_time) + d3.event.dx);
        factor.setTime(new_time);
        if (this.bg) {
            this.updateBG(this.bg);
        }
    }
    dragY(d, factor) {
        let old_amount = factor.getAmount()
        let new_amount = this.y.invert(this.y(old_amount) + d3.event.dy);
        factor.setAmount(new_amount);
        if (this.bg) {
            this.updateBG(this.bg);
        }
    }
}

//ugly way of copying an array
function deep_copy(bg_orig) {
    return bg_orig.map(d => ({ ...d }));
}
// copied from https://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

