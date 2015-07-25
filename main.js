(function() {
  'use strict';

  // from Flat UI colors, with love
  // https://flatuicolors.com/

  // emerald
  var COLOR_NODE = '#2ecc71';
  // peter river
  var COLOR_VALUE = '#3498db';
  // alizarin
  var COLOR_ACTION = '#e74c3c';

  var cluster = d3.layout.cluster();

  var diagonal = d3.svg.diagonal()
      .projection(function(d) { return [d.y, d.x]; });

  var zoom = d3.behavior.zoom();

  var svg = d3.select('body').append('svg')
      .style('width', '100%')
      .style('height', '100%')
      .call(zoom.on('zoom', function() {
        svg.attr('transform', 'translate(' + d3.event.translate + ')scale(' + d3.event.scale + ')');
        zoom.translate(d3.event.translate);
        zoom.scale(d3.event.scale);
      }))
      .append('g');

  var tooltip = d3.select('body').append('div')
      .attr('id', 'tooltip')
      .style('display', 'none')
      .text('tooltip');

  function getUrlParameters() {
    var urlParams = {},
        match,
        pl = /\+/g, // Regex for replacing addition symbol with a space
        search = /([^&=]+)=?([^&]*)/g,
        decode = function (s) { return decodeURIComponent(s.replace(pl, ' ')); },
        query  = window.location.search.substring(1);

    while (match = search.exec(query))
      urlParams[decode(match[1])] = decode(match[2]);
    return urlParams;
  }

  // elements is an object, key is id, value is display type
  function getElements(elements) {
    return {
      show: function() {
        Object.keys(elements).forEach(function(element) {
          document.getElementById(element).style.display = elements[element];
        });
      },
      hide: function() {
        Object.keys(elements).forEach(function(element) {
          document.getElementById(element).style.display = 'none';
        });
      }
    };
  }

  function getColorForNode(d) {
    return {
      node: COLOR_NODE,
      action: COLOR_ACTION,
      value: COLOR_VALUE
    }[getNodeType(d)];
  }

  function getNodeType(d) {
    if(d.node.configs['$type'])
      return 'value';
    if(d.node.configs['$invokable'])
      return 'action';
    return 'node';
  }

  function connect(url) {
    var link = new DS.LinkProvider(url, 'visualizer-', {
      isRequester: true,
      isResponder: false
    });

    return link.connect().then(function() {
      return link.onRequesterReady;
    }).then(function(requester) {
      var root = {
        name: 'conns',
        children: [],
        node: {
          configs: {},
          remotePath: '/conns'
        }
      };

      var depthSize = [1];
      function list(path, obj, depth) {
        var called = false;
        return new Promise(function(resolve, reject) {
          console.log(path);
          requester.list(path).on('data', function(update) {
            if(called)
              return;
            called = true;

            var promises = [];
            Object.keys(update.node.children).forEach(function(child) {
              var node = update.node.children[child];
              var map = {
                name: node.configs['$name'] || child,
                children: [],
                node: node
              };

              obj.children.push(map);
              depthSize[depth] = !!depthSize[depth] ? depthSize[depth] + 1 : 1;

              if(node.remotePath.split('/').length <= 3)
                promises.push(list(node.remotePath, map, depth + 1));
            });

            Promise.all(promises).then(function() {
              resolve();
            }).catch(function(e) {
              reject(e);
            });
          });
        });
      }

      list('/conns', root, 1).then(function() {
        console.log('done');
        cluster = cluster.size([200 + (20 * Math.max.apply(Math, depthSize)), depthSize.length * 300]);

        var nodes = cluster.nodes(root),
            links = cluster.links(nodes);

        var link = svg.selectAll('.link')
            .data(links)
            .enter().append('path')
            .attr('class', 'link')
            .attr('d', diagonal);

        var node = svg.selectAll('.node')
            .data(nodes)
            .enter().append('g')
            .attr('class', 'node')
            .attr('transform', function(d) { return 'translate(' + d.y + ',' + d.x + ')'; });

        var circle = node.append('circle')
            .attr('r', 4.5)
            .style('fill', function(d) {
              return getColorForNode(d);
            })
            .on('mouseover', function(d) {
              var x = (d.y * zoom.scale() + zoom.translate()[0]);
              var y = (d.x * zoom.scale() + zoom.translate()[1]);

              var nodeText = 'NODE';

              tooltip.html('<span style="margin-right: 8px;color: '
                  + getColorForNode(d) + ';">'
                  + getNodeType(d).toUpperCase()
                  + '</span>' + d.node.remotePath);
              tooltip.style('display', 'block');
              tooltip.style('left', (x - (tooltip.node().getBoundingClientRect().width / 2)) + 'px');
              tooltip.style('top', (y - 40) + 'px');
              d3.select(this).attr('r', 6);
            })
            .on('mouseout', function(d) {
              tooltip.style('display', 'none');
              d3.select(this).attr('r', 4.5);
            });

        node.append('text')
            .attr('dx', function(d) { return d.children && d.children.length > 0 ? -8 : 8; })
            .attr('dy', 3)
            .style('text-anchor', function(d) { return d.children && d.children.length ? 'end' : 'start'; })
            .text(function(d) { return d.name; });
      });
    }).catch(function(err) {
      console.log(err.$thrownJsError ? err.$thrownJsError.stack : err.stack);
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    var urlParams = getUrlParameters();
    var elements = getElements({
      'title': 'block',
      'container': 'flex'
    });

    if(!urlParams.url) {
      elements.show();

      document.getElementById('connect-btn').onclick = function() {
        var url = document.getElementById('broker-url').value;
        connect(url).then(function() {
          elements.hide();
        });
      };
    } else {
      connect(urlParams.url);
    }
  }, false);
})();
