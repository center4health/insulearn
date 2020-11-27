/* Library to bundle all calculations around blood glucose, insulin and meals for type 1 diabetes
* It provides means to get blood glucose data and manipulate it by adding insulin, meal and other events
*
* This code is designed to explain concepts not to make dosing decisions. We do our best to ensure that all 
* concepts are implemented as close to reality as possible but every body is different.
*
* Currently written in ECMA6 may have to transpile for older browsers
*/
"use strict";


/**
 * Glucose class. Represents the glucose data for a defined tiemspan
 *
 * @constructor
 * @param {Number} dose         - The amount of Insulin in Units
 * @param {Number} bolus_time   - The time of the bolus in minutes
 * @param {INSULIN_TYPE} type      - The type of insulin
 */
class Glucose {
    factors = [];
    base = [];
    constructor(from, to, isf = 2, carb_ratio = 8) {
        this.start;
        this.factors = [];
        d3.timeMinutes(from, to, 5).forEach(x_val => {
            this.base.push({ "x": x_val, "y": 100 })
        });
        this.isf = isf;
        this.carb_ratio = carb_ratio;
    }
    loadJSON(json_object) {
        this.base = []
        let timeParse = d3.timeParse("%H:%M:%S")

        json_object.forEach(d => {
            this.base.push({ "x": timeParse(d[0]), "y": d[1] });
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
    * Returns the current bg curve
    */
    getShape() {
        let result = deep_copy(this.base);
        let last_change = 0
        for (let i = 0; i < result.length; i++) {
            if (i > 0) {
                last_change = this.base[i].y - this.base[i - 1].y;
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
        return d3.extent(this.base, function (d) { return d.x; });
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
    getShape(sampling = 5) {
        let curve = [];
        for (let min = 0; min < this.type.DURATION; min += sampling) {
            curve.push({ x: d3.timeMinute.offset(this.time, min), y: this.getActivity(min) });
        }
        return curve;
    }

    /**
    * set the time of the bolus
    * @param {Object} bolus_time - Time of the bolus d3 date object
    * @return {Insulin} - the current object to allow chaining of methods
    **/
    setTime(time) {
        let old_time = this.time;
        let minute_change = (time - old_time) / (60 - 1000)
        //notify listeners?
        this.time = time;
        this.updateGraph()
        return this;
    }

    /**
    * set the time of the factor
    * @param {Number} minute - Minute offset for this factor
    * @return {Factor} - the current object to allow chaining of methods
    **/
    changeTimeByMinute(minute) {
        this.time = d3.timeMinute.offset(this.default_time, minute)
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
        this.amount = amount;
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
}

const INSULIN_TYPE = {
    "RAPID": { PEAK: 80, DURATION: 300, ONSET: 10 },  // e.g. humalog
}

const MEAL_COMPONENTS = {
    "SIMPLE_CARB": { PEAK: 20, DURATION: 100, ONSET: 0 },  // e.g. sugar
}


/**
 * Insulin class. Represents one bolus with:
 *
 * @constructor
 * @param {Number} dose         - The amount of Insulin in Units
 * @param {Object} bolus_time   - The time of the bolus 
 * @param {INSULIN_TYPE} type      - The type of insulin
 */
class Insulin extends Factor{
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
        if ((minutes < 0) | minutes>this.type.DURATION) {
            return bg
        } else {
            return bg - this.getActivity(minutes) / 20
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
        let insulin = this.amount * 1000;

        let tau = peak * (1 - peak / end) / (1 - 2 * peak / end);  // time constant of exponential decay
        let a = 2 * tau / end;                                     // rise time factor
        let S = 1 / (1 - a + (1 + a) * Math.exp(-end / tau));      // auxiliary scale factor

        var activityContrib = insulin * (S / Math.pow(tau, 2)) * minsAgo * (1 - minsAgo / end) * Math.exp(-minsAgo / tau);
        return activityContrib
    } 
    updateGraph() {
        if (this.chart) {
            this.chart.updateInsulin(this);
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
class Meal extends Factor{
    constructor(carbs, meal_time) {
        super(meal_time, carbs, MEAL_COMPONENTS.SIMPLE_CARB);
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
        if (minutes < 0| minutes>this.type.DURATION) {
            return bg
        } else {
            return bg + this.getActivity(minutes) / 10
        }
    }
    /** 
    * Return digested carbs at a point in time
    *
    * @param {Number} time - Minutes since meal
    * Code adapted from https://github.com/openaps/oref0/blob/master/lib/iob/calculate.js inspired by 
    * https://github.com/LoopKit/Loop/issues/388#issuecomment-317938473
    **/
    getActivity(minsAgo) {
        let end = this.type.DURATION;
        let peak = this.type.PEAK;

        if (minsAgo > this.end) {
            return 0;
        }
       
        let carbs = this.amount * 500;

        let tau = peak * (1 - peak / end) / (1 - 2 * peak / end);  // time constant of exponential decay
        let a = 2 * tau / end;                                     // rise time factor
        let S = 1 / (1 - a + (1 + a) * Math.exp(-end / tau));      // auxiliary scale factor
        var activityContrib = carbs * (S / Math.pow(tau, 2)) * minsAgo * (1 - minsAgo / end) * Math.exp(-minsAgo / tau);
        return activityContrib
    }
    updateGraph() {
        if (this.chart) {
            this.chart.updateMeal(this);
        }
    }
}


/**
 * Chart class that handles all drawing using d3.
 * @constructor
 * @param target
 */
class Chart {
    margin = { top: 20, right: 20, bottom: 30, left: 50 };
    constructor(target, timerange, target_range = [70, 180]) {
        this.svg = d3.select(target); //select target
        this.width = this.svg.attr("width") - this.margin.left - this.margin.right;
        this.height = this.svg.attr("height") - this.margin.top - this.margin.bottom;
        this.target_range = target_range;

        this.x = d3.scaleTime().range([0, this.width]).clamp(true);
        this.y = d3.scaleLinear().domain([0, 400])
            .rangeRound([this.height, 0]).clamp(true);
        this.y.domain([0, 400]);
        this.x.domain(timerange);
        this.drawBase(this.svg);
    }

    drawTargetRange(range) {
        //remove whatever has been drawn before
        this.area.selectAll(".range").remove();
        if (range) {
            this.target_range = range;
        } else {
            range = this.target_range;
        }
        let range_svg = this.area.append('g').attr("class", "range")

        // shade time in range section
        range_svg.append('rect')
            .style("fill", "#EFF6FE")
            .attr("x", 0)
            .attr("y", this.y(range[1]))
            .attr("width", this.width)
            .attr("height", this.y(range[0]) - this.y(range[1]));

        //line lower threshold
        range_svg.append('line')
            .style("stroke", "#EB8690") // color of lower threshold line
            .style("stroke-dasharray", ("3, 5"))
            .style("stroke-width", 2)
            .attr("x1", 0)
            .attr("y1", this.y(range[0]))
            .attr("x2", this.width)
            .attr("y2", this.y(range[0]));

        //line upper threshold
        range_svg.append('line')
            .style("stroke", "#FFB800") // color of upper threshold line
            .style("stroke-dasharray", ("3, 5"))
            .style("stroke-width", 2)
            .attr("x1", 0)
            .attr("y1", this.y(range[1]))
            .attr("x2", this.width)
            .attr("y2", this.y(range[1]));

        // upper threshold label
        range_svg.append("text")
            .attr("y", this.y(range[1]))
            .attr("x", this.width)
            .attr('text-anchor', 'middle')
            .attr("class", "range") // use to style in stylesheet
            .text(range[1]);

        // lower threshold label
        range_svg.append("text")
            .attr("y", this.y(range[0]))
            .attr("x", this.width)
            .attr('text-anchor', 'middle')
            .attr("class", "range") // use to style in stylesheet
            .text(range[0]);
    }

    drawBase(svg) {
        this.area = svg.append("g")
            .attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")");

        this.drawTargetRange();

        // glucose label
        this.svg.append("text")
            .attr("transform", `translate(${this.margin.right / 2},${this.y(100)}) rotate(-90)`)
            .attr("class", "range") // use to style in stylesheet
            .text("glucose (mg/dL)");

        let xAxis = d3.axisBottom(this.x);
        let yAxis = d3.axisLeft(this.y);

        this.area.append('g')
            .attr('class', 'axis axis--x')
            .attr('transform', 'translate(0,' + this.height + ')')
            .call(xAxis);

        this.area.append('g')
            .attr('class', 'axis axis--y')
            .call(yAxis);
        return this.area;
    }

    drawBG(bg) {
        this.bg = bg;
        bg.setChart(this);
        this.removeBG();  //clean up before we start
        let g = this.area.append("g").attr("class", "bg_curve");

        // BG graph
        g.selectAll('circle')
            .data(bg.getShape())
            .enter()
            .append('circle')
            .attr('r', 3.0)
            .style('cursor', 'pointer')
            .style('fill', '#000000'); // glucose curve color
        this.updateBG(bg);
    }

    updateBG(bg) {
        this.area.select(".bg_curve").selectAll('circle')
            .data(bg.getShape())
            .attr('cx', (d) => { return this.x(d.x); })
            .attr('cy', (d) => { return this.y(d.y); });
    }
    removeBG() {
        this.area.selectAll(".bg_curve").remove();
    }

    drawMeal(meal) {
        meal.setChart(this);
        this.removeMeal(meal); //clean up

        let g = this.area.append("g").attr("class", "meal" + meal.getUUID());
        g.append("path")
            .datum(meal.getShape())
            .attr("fill", "#41FF8E")
            .attr("fill-opacity", "0.5")
            .attr("stroke", "#41948E") // insulin curve color
            .attr("stroke-width", 5) // size(stroke) of the insulin curve
            .call(d3.drag()
                .on('drag', (d, a, b, factor = meal) => { this.dragX(d, factor); }));

        this.drawMarker(g, "Meal");
        this.updateMeal(meal);
    }
    updateMeal(meal) {
        let g = this.area.selectAll(".meal" + meal.getUUID())
        this.updateCurve(g, meal);
        this.updateMarker(g, meal);
    }
    removeMeal(meal) {
        this.area.selectAll(".meal" + meal.getUUID()).remove();
    }
    drawMarker(g, name) {
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
    }

    drawInsulin(insulin) {
        insulin.setChart(this);
        this.area.selectAll(".insulin" + insulin.getUUID()).remove();
        let g = this.area.append("g").attr("class", "insulin" + insulin.getUUID());

        // insulin curve
        g.append("path")
            .datum(insulin.getShape())
            .attr("fill", "#41948E")
            .attr("fill-opacity", "0.5")
            .attr("stroke", "#41948E") // insulin curve color
            .attr("stroke-width", 5) // size(stroke) of the insulin curve
            .call(d3.drag()
                .on('drag', (d, a, b, factor = insulin) => { this.dragX(d, factor); }));

        this.drawMarker(g, "Bolus");

        this.updateInsulin(insulin);
    }
    updateCurve(g, factor) {
        g.selectAll("path")
            .datum(factor.getShape())
            .attr("d", d3.line()
                .x((d) => { return this.x(d.x) })
                .y((d) => { return this.y(d.y) })
            );

    }
    updateInsulin(insulin) {
        let g = this.area.selectAll(".insulin" + insulin.getUUID());
        this.updateCurve(g, insulin);
        this.updateMarker(g, insulin);

    }
    removeInsulin(insulin) {
        this.area.selectAll(".meal" + insulin.getUUID()).remove();
    }
    dragX(d, factor) {
        let old_time = factor.getTime()
        let new_time = this.x.invert(this.x(old_time) + d3.event.dx);
        factor.setTime(new_time);
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










