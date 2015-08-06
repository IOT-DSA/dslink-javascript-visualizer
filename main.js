(function() {
  'use strict';

  var util = {
    getUrlParams: function() {
      var urlParams = {},
          match,
          pl = /\+/g, // Regex for replacing addition symbol with a space
          search = /([^&=]+)=?([^&]*)/g,
          decode = function (s) { return decodeURIComponent(s.replace(pl, ' ')); },
          query  = window.location.search.substring(1);

      while (match = search.exec(query))
        urlParams[decode(match[1])] = decode(match[2]);
      return urlParams;
    },
    toggleElements: function(elements) {
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
    },
    matrix: function() {
      var matrix = [1, 0, 0, 1, 0, 0];
      var f = function() {
        return 'matrix(' + matrix.join(',') + ')';
      };

      f.translate = function(x, y) {
        matrix[4] = x;
        matrix[5] = y;
        return f;
      };

      f.scale = function(s) {
        matrix[0] = s;
        matrix[3] = s;
        return f;
      }

      return f;
    },
    asyncFor: function(to, callback) {
      var f = 0;
      var chain = Promise.resolve();
      for(; f < to; f++) {
        var i = f;
        chain.then(function() {
          return callback(i);
        });
      }

      return chain;
    },
    EventEmitter: function() {
      this.listeners = {};
    }
  };

  util.EventEmitter.prototype = {
    emit: function(name) {
      var args = [];
      var count = 1;
      var length = arguments.length;

      for(; count < length; count++) {
        args.push(arguments[count]);
      }

      (this.listeners[name] || []).forEach(function(f) {
        f.apply(this, args);
      }, this);
    },
    on: function(name, listener) {
      if(!this.listeners[name])
        this.listeners[name] = [];
      this.listeners[name].push(listener);
      return listener;
    },
    remove: function(name, listener) {
      return this.listeners[name].splice(this.listeners[name].indexOf(listener), 1);
    }
  };

  var div, dom, svg, tooltip, root, paths;

  var windowWidth = window.innerWidth;
  var windowHeight = window.innerHeight;

  window.addEventListener('resize', function() {
    windowWidth = window.innerWidth;
    windowHeight = window.innerHeight;
  });

  // from Flat UI colors, with love
  // https://flatuicolors.com/

  // emerald
  var COLOR_NODE = '#2ecc71';
  // peter river
  var COLOR_VALUE = '#3498db';
  // alizarin
  var COLOR_ACTION = '#e74c3c';
  // amethyst
  var COLOR_BROKER = '#9b59b6';

  var TRACE_REQUESTER = '/sys/trace/traceRequester';

  var types = {
    colors: {
      node: COLOR_NODE,
      action: COLOR_ACTION,
      value: COLOR_VALUE,
      broker: COLOR_BROKER
    },
    traceColors: {
      list: COLOR_NODE,
      invoke: COLOR_ACTION,
      subscribe: COLOR_VALUE
    },
    getColor: function(d) {
      return types.colors[types.getType(d)];
    },
    getType: function(d) {
      if(d.queue.broker)
        return 'broker';
      if(d.node.configs['$type'])
        return 'value';
      if(d.node.configs['$invokable'])
        return 'action';
      return 'node';
    },
    getColorFromTrace: function(d) {
      return types.traceColors[d.type];
    }
  };

  var tree = d3.layout.tree();

  var normalDiagonal = d3.svg.diagonal()
      .projection(function(d) { return [Math.round(d.y), Math.round(d.x)]; });

  var skewedDiagonal = (function() {
    var ySkew;
    var xSkew;

    var d = d3.svg.diagonal()
        .projection(function(d) {
          return [Math.round(d.y + ySkew), Math.round(d.x + xSkew)];
        });

    return function(y, x) {
      ySkew = y;
      xSkew = x;
      return d;
    };
  })();

  var zoom = d3.behavior.zoom();

  var i = 0;
  var visualizer = {
    tooltipValue: null,
    svgWidth: 0,
    svgHeight: 0,
    translateY: 0,
    translateX: 0,
    translate: function(y, x) {
      visualizer.translateY = y;
      visualizer.translateX = x;

      var transform = util.matrix().translate(y, x)();

      dom.style('transform', transform);
      return transform;
    },
    toggle: function(d) {
      if (d.children) {
        d._children = d.children;
        d.children = null;
      } else {
        d.children = d._children;
        d._children = null;
      }
    },
    update: function(n) {
      paths = {};

      var depthSize = [1];
      var depth = function(obj, d) {
        if(obj.children && obj.children.length > 0) {
          obj.children.forEach(function(child) {
            depthSize[d] = !!depthSize[d] ? depthSize[d] + 1 : 1;
            depth(child, d + 1);
          });
        }
      }

      depth(root, 1);

      var oldY = root.y;
      var oldX = root.x;

      var height = 200 + (20 * Math.max.apply(Math, depthSize));
      var width = depthSize.length * 300;

      tree = tree.size([height, width]);

      var nodes = tree.nodes(root);

      // fixed size to 300px per layer
      // move depth over to the left one to account for hidden root
      nodes.forEach(function(node) {
        node.y = Math.max(300 * (node.depth - 1), 0);
      });

      var yDiff = root.y - (oldY || root.y);
      var xDiff = root.x - (oldX || root.x);

      var heightAdjusted = height >= visualizer.svgHeight || width >= visualizer.svgWidth;
      var diagonal = heightAdjusted ? normalDiagonal : skewedDiagonal(-yDiff, -xDiff);

      var links = tree.links(nodes).filter(function(link) {
        return !link.source.hidden && !link.target.hidden;
      });

      nodes = nodes.filter(function(node) {
        return !node.hidden;
      });

      nodes.forEach(function(node) {
        paths[node.node.remotePath] = node;

        if(!node.queue.broker || !node.link)
          return;

        links.push({
          source: node,
          target: node.link
        });
      });

      var link = svg.selectAll('.link')
          .data(links, function(d) {
            return d.target.node.remotePath;
          });

      setTimeout(function() {
        window.requestAnimationFrame(function() {
          nodes.forEach(function(d) {
            d.x0 = d.x;
            d.y0 = d.y;
          });

          if(height < visualizer.svgHeight && width < visualizer.svgWidth) {
            svg.attr({
              height: height,
              width: width
            });

            visualizer.svgHeight = height;
            visualizer.svgWidth = width;

            svg.style('transform', util.matrix()());

            link.attr('d', normalDiagonal);
          }
        });
      }, 400);

      if(heightAdjusted) {
        svg.attr({
          height: height,
          width: width
        });

        visualizer.svgHeight = height;
        visualizer.svgWidth = width;
      }

      link.attr('d', function(d) {
            return diagonal({
              source: {
                y: d.source.y0 + yDiff,
                x: d.source.x0 + xDiff
              },
              target: {
                y: (d.target.y0 || d.target.y) + yDiff,
                x: (d.target.x0 || d.target.x) + xDiff
              }
            });
          })
          .transition()
          .duration(400)
          .attr('d', diagonal);

      link.enter().insert('path', 'path.trace')
          .attr('class', 'link')
          .attr('d', function(d) {
            var map = {
              y: (n.y0 || n.y) + yDiff,
              x: (n.x0 || n.x) + xDiff
            };

            return diagonal({
              source: map,
              target: map
            });
          })
          .transition()
          .duration(400)
          .attr('d', diagonal);

      link.exit()
          .attr('d', function(d) {
            return diagonal({
              source: {
                y: d.source.y0 + yDiff,
                x: d.source.x0 + xDiff
              },
              target: {
                y: d.target.y0 + yDiff,
                x: d.target.x0 + xDiff
              }
            });
          })
          .transition()
          .duration(400)
          .attr('d', function(d) {
            return diagonal({source: n, target: n});
          })
          .remove();

      var node = dom.selectAll('div.node')
          .data(nodes, function(d) { return d.node.remotePath; })
          .style('background-color', function(d) {
            if(((!d.children && !d._children) || (d.children && !d._children)) && d.queue.listed && types.getType(d) !== 'action')
              return 'white';
            return types.getColor(d);
          });

      var text = dom.selectAll('div.text')
          .data(nodes, function(d) { return d.node.remotePath; });

      node.style('transform', function(d) {
        return util.matrix().translate((d.y0 || 0) + yDiff, (d.x0 || 0) + xDiff)();
      });

      text.style('transform', function(d) {
        return util.matrix().translate((d.y0 || 0) + yDiff, (d.x0 || 0) + xDiff)();
      });

      var nodeEnter = node.enter().append('div')
          .attr('class', 'node')
          .style('opacity', 0)
          .style('background-color', function(d) {
            if(!d.queue.listed)
              return types.getColor(d);
            if(((!d.children && !d._children) || (d.children && !d._children)) && types.getType(d) !== 'action')
              return 'white';
            return types.getColor(d);
          })
          .style('border-color', function(d) {
            return types.getColor(d);
          })
          .style('transform', function(d) {
            return util.matrix().translate(n.y, heightAdjusted ? n.x : ((n.x0 || 0) + xDiff))();
          })
          .on('mouseover', function(d) {
            visualizer.showTooltip(d);
            var e = d3.select(this);
            e.style('transform', (e.style('transform') || '') + 'scale(1.33)');
          })
          .on('mouseout', function(d) {
            if(visualizer.tooltipValue) {
              d.value.remove('value', visualizer.tooltipValue);
              visualizer.tooltipValue = null;
            }

            tooltip.hide();
            var e = d3.select(this);
            e.style('transform', 'translate(' + d.y + 'px,' + d.x + 'px)');
          })
          .on('click', function(d) {
            var onClick = function() {
              visualizer.toggle(d);
              visualizer.update(d);

              var pos = visualizer.getScreenPos(d);
              if(pos.x <= 0 || pos.y <= 0 || pos.x >= innerWidth || pos.y >= innerHeight)
                visualizer.moveTo(d);
            };

            if(!d.queue.listed) {
              visualizer.listChildren(d).then(function() {
                onClick();
              });
              return;
            }
            onClick();
          });

      var textEnter = text.enter().append('div')
          .attr('class', 'text')
          .style('transform', function() {
            return util.matrix().translate(n.y, heightAdjusted ? n.x : ((n.x0 || 0) + xDiff))();
          })
          .style('opacity', 0)
          .text(function(d) { return d.name; });

      [node.exit(), text.exit()].forEach(function(el) {
        el.style('transform', function(d) {
          return util.matrix().translate(d.y, d.x + xDiff)();
        })
        el.transition().duration(400)
          .style('opacity', 0)
          .style('transform', util.matrix().translate(n.y, n.x)())
          .remove();
      });

      [node, text, nodeEnter, textEnter].forEach(function(el) {
        el.transition().duration(400)
          .style('opacity', function(d) {
            if((el === text || el === textEnter) && d.node.configs['$disconnectedTs'])
              return 0.5;
            return 1;
          })
          .style('transform', function(d) {
            return util.matrix().translate(d.y, d.x)();
          });
      });

      var trace = svg.selectAll('.trace')
          .data(nodes.filter(function(node) {
            return node.links && node.links.length > 0;
          }).reduce(function(original, node) {
            return original.concat(node.links);
          }, []), function(d) {
            return d.path + '/' + d.origin;
          });

      var traceFunc = function(d) {
        var path = d.path;
        var node = paths[path];

        while(node === void 0) {
          if(path.lastIndexOf('/') === 0) {
            d.hidden = true;
            return null;
          }
          path = path.substring(0, path.lastIndexOf('/'));
          node = paths[path];
        }

        return diagonal({
          source: paths[d.source],
          target: node
        });
      };

      var traceEnter = trace.enter().append('path')
          .attr('class', 'trace')
          .attr('d', traceFunc)
          .attr('stroke', function(d) {
            return types.getColorFromTrace(d);
          })
          .on('mouseover', function(d) {
            var text = '';

            var addRow = function(content, style) {
              text += '<div class="legend-item" style="text-align:right;' + style + '">' + content + '</div>';
            };

            var addTitleRow = function(title, content, style) {
              text += '<div class="legend-container" style="' + style + '"><div class="legend-item legend-title">' + title + '</div><div class="legend-item legend-content">' + content + '</div></div>';
            };

            addRow('<span style="color:' + types.getColorFromTrace(d) + '">' + d.type.toUpperCase() + '</span>', 'text-align:left;');

            addTitleRow('from', d.source);
            addTitleRow('to', d.path);

            if(d.amount > 1)
              addRow('called ' + d.amount.toString() + ' times');

            var mouse = d3.mouse(document.body);
            tooltip.show(mouse[0], mouse[1], text);
          })
          .on('mouseout', function(d) {
            tooltip.hide();
          })
          .on('click', function(d) {
            var path = d.path;
            var node = paths[path];
            var parts = [];

            while(node === void 0) {
              if(path.lastIndexOf('/') === 0) {
                break;
              }
              parts.push(path.slice(path.lastIndexOf('/') + 1));
              path = path.slice(0, path.lastIndexOf('/'));
              node = paths[path];
            }

            if(node === void 0)
              return;

            if(node !== parts[d.path]) {
              parts = parts.reverse();

              var l = parts.length;
              util.asyncFor(l, function(i) {
                var p = node.node.remotePath + '/' + parts.slice(0, i).join('/');
                if(p[p.length - 1] === '/')
                  p = p.substring(0, p.length - 1);

                if(paths[p] && paths[p]._children) {
                  visualizer.toggle(paths[p]);
                } else {
                  if(i > 1)
                    return visualizer.listChildren(paths[node.node.remotePath + '/' + parts.slice(0, i - 1).join('/')]);
                }
              }).then(function() {
                visualizer.update(node);
                visualizer.moveTo(paths[d.path]);
              });
            }
          });

      trace.transition()
          .duration(400)
          .attr('d', traceFunc);

      trace.exit().remove();

      var t = visualizer.translate(0, -root.x);
      if(height < visualizer.svgHeight && width < visualizer.svgWidth) {
        svg.style('transform', util.matrix().translate(0, xDiff)());
      }
    },
    _list: function(path, addChild, removeChild) {
      var called = false;
      return new Promise(function(resolve, reject) {
        visualizer.requester.list(path).on('data', function(update) {
          var children = update.node.children;
          var keys = Object.keys(children);

          if(!called) {
            keys.forEach(function(change) {
              addChild(change, children);
            });
            called = true;

            resolve();
          } else {
            update.changes.forEach(function(change) {
              if(change.indexOf('@') === 0 || change.indexOf('$') === 0)
                return;

              if(keys.indexOf(change) > 0) {
                addChild(change, children, false);
              } else {
                removeChild(change, children);
              }
            });
          }
        });
      })
    },
    listChildren: function(d) {
      if(d.queue.listed)
        return;

      var promises = [];
      (d._children || d.children || (d.children = [])).forEach(function(child) {
        promises.push(visualizer.list(child.node.remotePath, child, {
          deep: true
        }).then(function() {
          visualizer.toggle(child);
        }));
      });

      return Promise.all(promises).then(function() {
        d.queue.listed = true;
      });
    },
    list: function(path, obj, opt) {
      opt = opt || {};
      var called = false;
      return new Promise(function(resolve, reject) {
        console.log(path);

        visualizer.requester.list(path).on('data', function(update) {
          if(!obj.node)
            obj.node = update.node;
          var children = update.node.children;
          var keys = Object.keys(children);

          var promises = [];
          var addChild = function(child) {
            if(opt.blacklist && opt.blacklist.indexOf(child) > -1)
              return;

            var node = children[child];
            if(node.configs['$disconnectedTs'])
              return;

            var map = {
              name: node.configs['$name'] || child,
              realName: child,
              children: [],
              node: node,
              queue: {
                listed: false
              }
            };

            if(opt.addChild)
              opt.addChild(map, child, children);

            (obj._children || obj.children || (obj.children = [])).push(map);

            if(types.getType(map) === 'value' && !opt.deep) {
              map.value = new util.EventEmitter();
              map.value.value = null;
              // for update selections
              map.updateS = [];
              var subCalled = false;
              var lastTime = Date.now();

              visualizer.requester.subscribe(map.node.remotePath, function(subUpdate) {
                map.value.emit('value', subUpdate.value);
                map.value.value = subUpdate.value;

                if(subCalled) {
                  if(Date.now() - lastTime <= 20 || document.hidden)
                    return;
                  lastTime = Date.now();

                  var subNode = map.updateS.length > 0 ? (function() {
                    var e = map.updateS.splice(0, 1)[0];
                    clearTimeout(e.timer);
                    return e.node;
                  }()) : dom.selectAll('div.node').select(function(d) {
                    if(d === map)
                      return this;
                    return null;
                  }).append('div').attr('class', 'value');

                  subNode.style('transform', util.matrix()())
                    .style('opacity', 1)
                    .transition()
                    .duration(300)
                    .style('transform', util.matrix().scale(12)())
                    .style('opacity', 0);

                  setTimeout(function() {
                    window.requestAnimationFrame(function() {
                      subNode.style('opacity', 0).style('transform', util.matrix()());
                      var m = {
                        node: subNode,
                        timer: setTimeout(function() {
                          map.updateS.splice(map.updateS.indexOf(m), 1);
                          subNode.remove();
                        }, 30000 / (map.updateS.length + 1))
                      };

                      map.updateS.push(m);
                    });
                  }, 300);
                }

                subCalled = true;
              });
            }

            // so we can fill in params and columns within tooltips
            if(!opt.deep) {
              promises.push(visualizer.list(map.node.remotePath, map, {
                deep: true
              }).then(function() {
                visualizer.toggle(map);
              }));
            }
          }

          var removeChild = function(change) {
            if(opt.blacklist && opt.blacklist.indexOf(change) > -1)
              return;

            [].concat(obj._children || obj.children).forEach(function(child, index) {
              if(child.realName === change) {
                if(opt.removeChild)
                  opt.removeChild(child, change, children);
                (obj._children || obj.children).splice(index, 1);
              }
            });
          };

          if(!called) {
            keys.forEach(addChild);
            called = true;
            Promise.all(promises).then(function() {
              resolve();
            }).catch(function(e) {
              reject(e);
            });
          } else {
            update.changes.forEach(function(change) {
              if(change.indexOf('@') === 0 || change.indexOf('$') === 0)
                return;
              if(keys.indexOf(change) > 0) {
                addChild(change);
              } else {
                removeChild(change);
              }
            });
            visualizer.update(obj);
          }
        });
      });
    },
    connect: function(url) {
      var link = new DS.LinkProvider(url, 'visualizer-', {
        isRequester: true,
        isResponder: false
      });

      return link.connect().then(function() {
        return link.onRequesterReady;
      }).then(function(requester) {
        root = {
          queue: {
            depth: 1
          },
          children: [],
          hidden: true
        };

        visualizer.requester = requester;
        var upstream = function(path, depth, opt) {
          opt = opt || {};

          var mapName = path.split('/')[path.split('/').length - 1] || '/';
          var map = {
            name: mapName,
            realName: mapName,
            queue: {
            },
            link: opt.link || null,
            children: []
          };

          return visualizer.list(path + '/conns', map, {
            deep: true,
            blacklist: opt.blacklist || [],
            addChild: function(m, change, children) {
              // TODO: Get better support for this, once an API is implemented to get broker path
              if(m.node.remotePath === '/conns/visualizer')
                return;

              // code for trace requester
              // TODO: Only trace actual requesters
              m.links = [];
              var trace = {
                list: {},
                subscribe: {},
                invoke: {}
              };

              visualizer.requester.invoke(path + TRACE_REQUESTER, {
                requester: m.node.remotePath.substring(path.length),
                sessionId: null
              }).on('data', function(invokeUpdate) {
                try {
                  invokeUpdate.rows;
                } catch(e) {
                  return;
                }

                var r = invokeUpdate.rows;
                var shouldUpdate = false;
                r.forEach(function(row) {
                  var added = row[4] === '+';
                  var rid = row[2];

                  if(added) {
                    var t = trace[row[1]][path + row[0]];
                    if(t) {
                      t.amount++;
                    } else if(path + row[0] !== m.node.remotePath) {
                      m.links.push({
                        source: m.node.remotePath,
                        path: path + row[0],
                        type: row[1],
                        rid: row[2],
                        amount: 1,
                        trace: true
                      });

                      trace[row[1]][path + row[0]] = m.links[m.links.length - 1];
                      shouldUpdate = true;
                    }
                  } else {
                    var shouldDeleteUpdate = false;

                    // TODO: Not sure if this supports unsubscribe
                    setTimeout(function() {
                      [].concat(m.links).forEach(function(link) {
                        if(link.path === row[0] && link.type === row[1]) {
                          if(link.amount > 1) {
                            link.amount = link.amount - 1;
                          } else {
                            m.links.splice(m.links.indexOf(link), 1);
                            delete trace[row[1]][path + row[0]];
                            shouldDeleteUpdate = true;
                          }
                        }
                      });

                      if(m.queue.listed && shouldDeleteUpdate && svg)
                        visualizer.update(m);
                    }, 400);
                  }
                });

                if(m.queue.listed && shouldUpdate && svg) {
                  visualizer.update(m);
                }
              });
            },
            removeChild: function(m, change, children) {

            }
          }).then(function() {
            return visualizer.listChildren(map);
          }).then(function() {
            var promises = [];
            root.children.push(map);

            var addChild = function(child, children, initial) {
              initial = initial || true;
              if(initial) {
                if(root.queue.depth < (depth + 1)) {
                  root = {
                    queue: {
                      depth: depth + 1
                    },
                    children: [root],
                    hidden: true
                  };
                }

                root = root.queue.depth == (depth + 1) ? root : (function() {
                  var r = root;
                  var i = root.queue.depth;
                  for(; i < depth; i++) {
                    r = r.children[0];
                  }

                  return r;
                }());

                promises.push((new Promise(function(resolve, reject) {
                  var subscribeHandler = function(subUpdate) {
                    visualizer.requester.unsubscribe(path + '/sys/upstream/' + child + '/name', subscribeHandler);
                    resolve(subUpdate.value);
                  };

                  visualizer.requester.subscribe(path + '/sys/upstream/' + child + '/name', subscribeHandler);
                })).then(function(value) {
                  return upstream(path + '/upstream/' + child, depth + 1, {
                    blacklist: [value],
                    link: map
                  });
                }));
              }
            };

            var removeChild = function(change, children) {
              [].concat(root.children).forEach(function(child, index) {
                if(child.realName === change)
                  root.children.splice(index, 1);
              });
            };

            return visualizer._list(path + '/upstream', addChild, removeChild).then(function() {
              return Promise.all(promises);
            });
          }).then(function() {
            return map;
          })
        };

        upstream('', 1).then(visualizer.done);
      }).catch(function(err) {
        console.log(err.$thrownJsError ? err.$thrownJsError.stack : err.stack);
      });
    },
    getScreenPos: function(d) {
      return {
        x: visualizer.translateY + d.y * zoom.scale() + zoom.translate()[0],
        y: (visualizer.translateX + d.x) * zoom.scale() + zoom.translate()[1]
      };
    },
    moveTo: function(d) {
      var scale = zoom.scale();

      var x = (-d.y - visualizer.translateY) * scale + 400;
      var y = (-d.x - visualizer.translateX) * scale + 400;
      zoom.translate([x, y]);
      div.transition()
          .duration(400)
          .style('transform', util.matrix().scale(scale).translate(x, y)());
    },
    showTooltip: function(d) {
      var text = '';

      var addRow = function(content, style) {
        text += '<div class="legend-item" style="text-align:right;' + style + '">' + content + '</div>';
      };

      var addTitleRow = function(title, content, style) {
        text += '<div class="legend-container" style="' + style + '"><div class="legend-item legend-title">' + title + '</div><div class="legend-item legend-content">' + content + '</div></div>';
      };

      addTitleRow('<span style="color:' + types.getColor(d) + '">' + types.getType(d).toUpperCase() + '</span>', d.node.remotePath);

      var children = Object.keys(d.node.children).length;
      if(types.getType(d) === 'node' && children > 0)
        addRow(children + ' children');

      if(types.getType(d) === 'value') {
        var type = d.node.configs['$type'];
        addTitleRow('type', type);

        if(type === 'map' && d.value.value != null) {
          addRow('value', 'text-align:left;');
          var map = d.value.value;
          Object.keys(map).forEach(function(key) {
            var value = map[key];
            value = (value == null ? '<span style="color:#f1c40f;">null</span>' : value.toString());
            if(value.trim().length == 0)
              value = '<span style="color:#f1c40f;">\' \'</span>';
            addTitleRow(key, value, 'background-color: rgba(0,0,0,0.1);');
          });
        } else {
          var value = (d.value.value == null ? '<span id="value"><span style="color:#f1c40f;">null</span></span>' : '<span id="value">' + d.value.value.toString() + '</span>');
          if(value.trim().length == 0)
            value = '<span style="color:#f1c40f;">\' \'</span>';
          addTitleRow('value', value);
          visualizer.tooltipValue = d.value.on('value', function(value) {
            tooltip.node.select('#value').html((d.value.value == null ? '<span style="color:#f1c40f;">null</span>' : d.value.value.toString()));
          });
        }
      }

      if(types.getType(d) === 'action') {
        var config = d.node.configs;
        var keys = Object.keys(config);

        if(keys.indexOf('$params') > 0) {
          var params = config['$params'];
          addRow('params', 'text-align:left;');

          params.forEach(function(param) {
            addTitleRow(param.name, param.type, 'background-color: rgba(0,0,0,0.1);');
          });
        }

        if(keys.indexOf('$columns') > 0) {
          var columns = config['$columns'];
          addRow('columns', 'text-align:left;');

          columns.forEach(function(column) {
            addTitleRow(column.name, column.type, 'background-color: rgba(0,0,0,0.1);');
          });
        }
      }

      if(d.node.configs['$disconnectedTs']) {
        addRow('disconnected', 'color: #bdc3c7;');
      }

      var pos = visualizer.getScreenPos(d);
      tooltip.show(pos.x, pos.y, text);
    },
    done: function() {
      console.log('done');

      div = d3.select('body').append('div')
          .style('width', '100%')
          .style('height', '100%')
          .call(zoom.on('zoom', function() {
            div.style('transform', util.matrix().translate(d3.event.translate[0], d3.event.translate[1]).scale(d3.event.scale)());
            zoom.translate(d3.event.translate);
            zoom.scale(d3.event.scale);
          }))
          .append('div')
          .attr('class', 'graph');

      dom = div.append('div');
      svg = dom.append('svg');

      tooltip = (function() {
        var node = d3.select('body').append('div')
            .attr('id', 'tooltip')
            .style('display', 'none')
            .text('tooltip');

        return {
          node: node,
          show: function(x, y, text) {
            node.html(text);
            node.style('display', 'block');

            var rect = node.node().getBoundingClientRect();

            if(x + rect.width / 2 >= windowWidth)
              x -= rect.width / 2;
            if(x - rect.width / 2 <= 0)
              x += rect.width / 2;
            x -= rect.width / 2;

            node.style('left', x + 'px');

            if((y - 8 - rect.height) <= 0) {
              y += 8;
            } else {
              y -= rect.height;
              y -= 8;
            }

            node.style('top', y + 'px');
          },
          hide: function() {
            node.style('display', 'none');
            tooltip.node.style('left', 'auto');
            tooltip.node.style('top', 'auto');
            tooltip.node.style('right', 'auto');
            tooltip.node.style('bottom', 'auto');
          }
        };
      }());

      var legend = d3.select('body').append('div')
          .attr('id', 'legend');

      legend.append('p')
          .attr('id', 'title')
          .text('Visualizer');

      Object.keys(types.colors).forEach(function(type, i) {
        var text = type.toUpperCase();
        var traceColors = Object.keys(types.traceColors);
        if(traceColors.length > i)
          text += ' <span style="opacity:0.2;">/</span> ' + traceColors[i].toUpperCase();
        legend.append('div')
            .attr('class', 'legend-item')
            .html('<div class="color" style="float:left;background-color:' + types.colors[type] + ';"></div><div style="float:left;display:inline-block;">' + text + '</div>');
      });

      d3.select('body').append('div')
          .attr('id', 'home')
          .on('mouseover', function(d) {
            tooltip.node.text('Go to /conns');
            tooltip.node.style('display', 'block');
            tooltip.node.style('right', '88px');
            tooltip.node.style('bottom', '28px');
            tooltip.node.style('text-align', 'center');
          })
          .on('mouseout', function(d) {
            tooltip.node.style('text-align', 'left');
            tooltip.hide();
          })
          .on('click', function() {
            zoom.translate([400, 400]);
            zoom.scale(1);
            div.transition()
                .duration(800)
                .style('transform', util.matrix().translate(400, 400)());
          })
          .append('img')
          .attr('src', 'images/home.svg')
          .attr('width', '24px')
          .attr('height', '24px');

      visualizer.update(root);

      zoom.translate([400, 400]);
      zoom.event(div);
    },
    main: function() {
      var params = util.getUrlParams();
      var elements = util.toggleElements({
        title: 'block',
        container: 'flex'
      });

      if(!params.url) {
        elements.show();

        document.getElementById('connect-btn').onclick = function() {
          var url = document.getElementById('broker-url').value;
          visualizer.connect(url).then(function() {
            elements.hide();
          });
        };
      } else {
        if(params.url[params.url.length - 1] === '/')
          params.url = params.url.substring(0, -1);
        visualizer.connect(params.url);
      }
    }
  };

  document.addEventListener('DOMContentLoaded', visualizer.main, false);
})();
