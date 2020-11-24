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
    constructor(from, to) {
        this.start
        this.factors = []
    }
    generateBase(from, to) {

    }
    loadJSON(json_object) {
        this.base = []
        let timeParse = d3.timeParse("%H:%M:%S")

        json_object.forEach(d => {
            this.base.push([timeParse(d[0]), d[1]]);
        })
    }
    addFactor(factor) {
        this.factors.push(factor)
    }
    /*
    * Returns the current bg curve
    */
    getShape() {
        let result = deep_copy(this.base);
        let last_change = 0
        for (let i = 0; i < result.length; i++) {
            if (i > 0) {
                last_change = this.base[i][1] - this.base[i - 1][1];
                result[i][1] = result[i - 1][1] + last_change;
            }
            this.factors.forEach(factor => {
                result[i][1] = factor.apply(result[i][1], result[i][0]);
            });

        }
        return result;
    }

    timeInRange() {
        let bg_data = this.getShape();
        var inrange = 0;
        for (i = 0; i < bg_data.length; i++) {
            if (bg_data[i][1] > 69 && bg_data[i][1] < 181) {
                inrange++;
            }
        }
        return Math.round(inrange / bg_data.length * 100);
    }
    getTimeRange() {
        return d3.extent(this.base, function (d) { return d[0]; });
    }

    draw(svg) {
        this.g = svg.append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

        // BG graph
        this.g.selectAll('circle')
            .data(this.getShape())
            .enter()
            .append('circle')
            .attr('r', 3.0)
            .attr('cx', function (d) { return chart.getX(d[0]); })
            .attr('cy', function (d) { return chart.getY(d[1]); })
            .style('cursor', 'pointer')
            .style('fill', '#000000'); // glucose curve color
    }

    refresh() {
        this.g.selectAll('circle')
            .data(this.getShape())
            .attr('cx', function (d) { return chart.getX(d[0]); })
            .attr('cy', function (d) { return chart.getY(d[1]); })
            ;
    }
}

const INSULIN_TYPE = {
    "RAPID": { PEAK: 80, DURATION: 300, ONSET: 10 },  // e.g. humalog
}

const MEAL_COMPONENTS = {
    "SIMPLE_CARB": { PEAK: 20, DURATION: 100, ONSET: 0 },  // e.g. humalog
}


/**
 * Insulin class. Represents one bolus with:
 *
 * @constructor
 * @param {Number} dose         - The amount of Insulin in Units
 * @param {Object} bolus_time   - The time of the bolus 
 * @param {INSULIN_TYPE} type      - The type of insulin
 */
class Insulin {
    constructor(dose, bolus_time, type) {
        this.dose = dose;
        this.default_time = bolus_time;
        this.bolus_time = bolus_time;
        this.type = type;
    }

    /** 
    * Return insulin effect at a point in time
    *
    * @param {Object} time - Minutes since bolus
    * Code adapted from https://github.com/openaps/oref0/blob/master/lib/iob/calculate.js inspired by 
    * https://github.com/LoopKit/Loop/issues/388#issuecomment-317938473
    **/
    apply(bg, time) {
        let minutes = (time - this.bolus_time) / (60 * 1000);
        if (minutes < 0) {
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
        let insulin = this.dose * 1000;

        let tau = peak * (1 - peak / end) / (1 - 2 * peak / end);  // time constant of exponential decay
        let a = 2 * tau / end;                                     // rise time factor
        let S = 1 / (1 - a + (1 + a) * Math.exp(-end / tau));      // auxiliary scale factor

        var activityContrib = insulin * (S / Math.pow(tau, 2)) * minsAgo * (1 - minsAgo / end) * Math.exp(-minsAgo / tau);
        return activityContrib
    }

    /**
    * returns insulin activity curve at a point in time
    * @param {Number} sampling - Sampling interval for the curve in minutes
    * @return {Array} - 2-dimensional array with timestamps and insulin values
    **/
    getShape(sampling = 5) {
        let curve = [];
        for (let min = 0; min < this.type.DURATION; min += sampling) {
            curve.push([d3.timeMinute.offset(this.bolus_time, min), this.getActivity(min)]);
        }
        return curve;
    }

    /**
    * set the time of the bolus
    * @param {Object} bolus_time - Time of the bolus d3 date object
    * @return {Insulin} - the current object to allow chaining of methods
    **/
    setTime(time) {
        this.bolus_time = time;
        return this;
    }

    /**
    * set the time of the bolus
    * @param {Number} minute - Minute offset for this bolus
    * @return {Insulin} - the current object to allow chaining of methods
    **/
    changeTimeByMinute(minute) {
        this.bolus_time = d3.timeMinute.offset(this.default_time, minute)
        return this;
    }

    /**
    * get the time of the bolus
    * @return {Object} - Time of the bolus d3 date object
    **/
    getTime() {
        return this.bolus_time;
    }

    /**
    * set/change the amount of insulin
    * @param {Number} dose - The new dose of this insulin bolus
    * @return {Insulin} - the current object to allow chaining of methods
    **/
    setDose(dose) {
        this.dose = dose;
        return this;
    }

    /**
    * get the amount of insulin
    * @return {Number} dose - The dose of this insulin bolus
    **/
    getDose() {
        return this.dose;
    }
    draw(svg) {
        this.g = svg.append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

        this.g.append("path")
            .datum(this.getShape())
            .attr("fill", "#41948E")
            .attr("fill-opacity", "0.5")
            .attr("stroke", "#41948E") // insulin curve color
            .attr("stroke-width", 5) // size(stroke) of the insulin curve
            .attr("d", d3.line()
                .x(function (d) { return chart.getX(d[0]) })
                .y(function (d) { return chart.getY(d[1]) })
            )

        // insulin vertical line
        this.g.append('line')
            .style("stroke", "#C4c4c4") // color of bolus line
            .style("stroke-dasharray", ("3, 5"))
            .style("stroke-width", 2)
            .attr("x1", chart.getX(this.bolus_time))
            .attr("y1", chart.getY(0))
            .attr("x2", chart.getX(this.bolus_time))
            .attr("y2", chart.getY(400));

        // bolus point
        this.g.append("circle")
            .attr("cx", chart.getX(this.bolus_time))
            .attr("cy", chart.getY(0))
            .attr("r", 5)
            .style("fill", "black");

        // bolus text
        this.g.select("text")
            .attr("x", chart.getX(this.bolus_time))
            .attr("y", chart.getY(5))
            .attr("class", "range") // use to style in stylesheet
            .text("Bolus");
    }
    refresh() {
        this.g.selectAll("path")
            .datum(this.getShape())
            .attr("d", d3.line()
                .x(function (d) { return chart.getX(d[0]) })
                .y(function (d) { return chart.getY(d[1]) })
            )
        // bolus point
        this.g.select("circle")
            .attr("x", chart.getX(this.bolus_time))
            .attr("y", chart.getY(5));

        //bolus vertical line
        this.g.select('line')
            .attr("x1", chart.getX(this.bolus_time))
            .attr("y1", chart.getY(0))
            .attr("x2", chart.getX(this.bolus_time))
            .attr("y2", chart.getY(400));


        // bolus text
        this.g.select("text")
            .attr("x", chart.getX(this.bolus_time))
            .attr("y", chart.getY(5))
    }

}



/**
 * Meal class. Represents one meal:
 *
 * @constructor
 * @param {Number} carbs     - The amount of carbs
 * @param {Object} meal_time  - The time of the meal in minutes
 */
class Meal {
    constructor(carbs, meal_time) {
        this.carbs = carbs;
        this.default_time = meal_time;
        this.meal_time = meal_time;
        this.type = MEAL_COMPONENTS.SIMPLE_CARB;
    }

    /** 
    * Return insulin effect at a point in time
    *
    * @param {Object} time - Minutes since bolus
    * Code adapted from https://github.com/openaps/oref0/blob/master/lib/iob/calculate.js inspired by 
    * https://github.com/LoopKit/Loop/issues/388#issuecomment-317938473
    **/
    apply(bg, time) {

        let minutes = (time - this.meal_time) / (60 * 1000);
        if (minutes < 0) {
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
        let carbs = this.carbs * 500;

        let tau = peak * (1 - peak / end) / (1 - 2 * peak / end);  // time constant of exponential decay
        let a = 2 * tau / end;                                     // rise time factor
        let S = 1 / (1 - a + (1 + a) * Math.exp(-end / tau));      // auxiliary scale factor
        var activityContrib = carbs * (S / Math.pow(tau, 2)) * minsAgo * (1 - minsAgo / end) * Math.exp(-minsAgo / tau);
        return activityContrib
    }

    /**
    * returns carb activity curve at a point in time
    * @param {Number} sampling - Sampling interval for the curve in minutes
    * @return {Array} - 2-dimensional array with timestamps and insulin values
    **/
    getShape(sampling = 2) {
        let curve = [];
        for (let min = 0; min < this.type.DURATION; min += sampling) {
            curve.push([d3.timeMinute.offset(this.meal_time, min), this.getActivity(min)]);
        }
        return curve;
    }
    /**
    * set the time of the meal
    * @param {Number} minute - Minute offset for this meal
    * @return {Insulin} - the current object to allow chaining of methods
    **/
   changeTimeByMinute(minute) {
    this.meal_time = d3.timeMinute.offset(this.default_time, minute)
    return this;
}

    /**
    * set/change the time of the bolus
    * @param {Object} time - Time of the meal d3 date object
    * @return {Insulin} - the current object to allow chaining of methods
    **/
    setTime(time) {
        this.meal_time = time;
        return this;
    }

    /**
    * gete the time of the meal
    * @return {Object} - Time of the meal d3 date object
    **/
    getTime(time) {
        return meal_time;
    }

    /**
    * set/change the amount of carbs
    * @param {Number} carbs - The new dose of this insulin bolus
    * @return {Insulin} - the current object to allow chaining of methods
    **/
    setCarbs(carbs) {
        this.carbs = carbs;
        return this;
    }

    /**
    * get the amount of carbs
    * @return {Number} carbs - The dose of this insulin bolus
    **/
    getCarbs() {
        this.carbs = carbs;
        return this;
    }

    /**
     * draw meal
     * 
     */
    draw(svg) {
        this.g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");


        this.g.append("path")
            .datum(this.getShape())
            .attr("fill", "#41FF8E")
            .attr("fill-opacity", "0.5")
            .attr("stroke", "#41948E") // insulin curve color
            .attr("stroke-width", 5) // size(stroke) of the insulin curve
            .attr("d", d3.line()
                .x(function (d) { return chart.getX(d[0]) })
                .y(function (d) { return chart.getY(d[1]) })
            )
        // meal vertical line
        this.g.append('line')
            .style("stroke", "#C4c4c4") // color of meal line
            .style("stroke-dasharray", ("3, 5"))
            .style("stroke-width", 2)
            .attr("x1", chart.getX(this.meal_time))
            .attr("y1", chart.getY(0))
            .attr("x2", chart.getX(this.meal_time))
            .attr("y2", chart.getY(400));

        // Meal point
        this.g.append("circle")
            .attr("cx", chart.getX(this.meal_time))
            .attr("cy", chart.getY(0))
            .attr("r", 5)
            .style("fill", "black");

        // Meal text
        this.g.append("text")
            .attr("x", chart.getX(this.meal_time))
            .attr("y", chart.getY(5))
            //.attr("transform", "translate(300,480)")
            .attr("class", "range") // use to style in stylesheet
            .text("Meal");
    }
    refresh() {
        this.g.selectAll("path")
            .datum(this.getShape())
            .attr("d", d3.line()
                .x(function (d) { return chart.getX(d[0]) })
                .y(function (d) { return chart.getY(d[1]) })
            )
        // bolus point
        this.g.select("circle")
            .attr("x", chart.getX(this.meal_time))
            .attr("y", chart.getY(5));

        //bolus vertical line
        this.g.select('line')
            .attr("x1", chart.getX(this.meal_time))
            .attr("y1", chart.getY(0))
            .attr("x2", chart.getX(this.meal_time))
            .attr("y2", chart.getY(400));


        // bolus text
        this.g.select("text")
            .attr("x", chart.getX(this.meal_time))
            .attr("y", chart.getY(5))
    }
    


}

let margin = { top: 20, right: 20, bottom: 30, left: 50 };

class Chart {
    constructor(target, timerange) {
        this.svg = d3.select(target); //select target
        this.width = this.svg.attr("width") - margin.left - margin.right;
        this.height = this.svg.attr("height") - margin.top - margin.bottom;
        this.x = d3.scaleTime().range([0, this.width]);
        this.y = d3.scaleLinear().domain([0, 400])
            .rangeRound([this.height, 0]);
        this.y.domain([0, 400]);
        this.x.domain(timerange);
        this.draw();
    }


    draw() {
        this.svg.append('rect')
            .attr('class', 'zoom')
            .attr('cursor', 'move')
            .attr('fill', 'none')
            .attr('pointer-events', 'all')
            .attr('width', this.width)
            .attr('height', this.height)
            .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')


        this.area = this.svg.append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");


        // shade time in range section
        this.area.append('rect')
            .style("fill", "#EFF6FE")
            .attr("x", 0)
            .attr("y", this.getY(180))
            .attr("width", this.width)
            .attr("height", this.getY(70) - this.getY(180));


        //line lower threshold
        this.area.append('line')
            .style("stroke", "#EB8690") // color of lower threshold line
            .style("stroke-dasharray", ("3, 5"))
            .style("stroke-width", 2)
            .attr("x1", 0)
            .attr("y1", this.getY(70))
            .attr("x2", this.width)
            .attr("y2", this.getY(70));

        //line upper threshold
        this.area.append('line')
            .style("stroke", "#FFB800") // color of upper threshold line
            .style("stroke-dasharray", ("3, 5"))
            .style("stroke-width", 2)
            .attr("x1", 0)
            .attr("y1", this.getY(180))
            .attr("x2", this.width)
            .attr("y2", this.getY(180));

        // upper threshold label
        this.area.append("text")
            .attr("y", this.getY(180))
            .attr("x", this.width)
            .attr('text-anchor', 'middle')
            .attr("class", "range") // use to style in stylesheet
            .text("180");

        // lower threshold label
        this.area.append("text")
            .attr("y", 415)
            .attr("x", 735)
            .attr('text-anchor', 'middle')
            .attr("class", "range") // use to style in stylesheet
            .text("70");


        // glucose label
        this.svg.append("text")
            .attr("transform", "translate(12,340) rotate(-90)")
            .attr("class", "range") // use to style in stylesheet
            .text("glucose (mg/dL)");

        // target range label
        this.svg.append("text")
            .attr("transform", "translate(750,393) rotate(-90)")
            .attr("id", "targetrange") // use to style in stylesheet
            .text("TARGET RANGE");


        let xAxis = d3.axisBottom(this.x);
        let yAxis = d3.axisLeft(this.y);

        this.area.append('g')
            .attr('class', 'axis axis--x')
            .attr('transform', 'translate(0,' + this.height + ')')
            .call(xAxis);

        this.area.append('g')
            .attr('class', 'axis axis--y')
            .call(yAxis);

        return this.svg;

    }
    getX(val) {
        return this.x(val);
    }
    getY(val) {
        return this.y(val);
    }

    getCanvas() {
        return this.svg;
    }
}





//ugly way of copying an array
function deep_copy(bg_orig) {
    var bg = bg_orig.map(function (arr) {
        return arr.slice();
    });
    return bg
}










