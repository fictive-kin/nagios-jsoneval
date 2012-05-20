Abitrary JSON Query/Evaluation (Nagios Plugin)
==============================================

Many modern apps in the web stack have JSON interfaces.

We needed highly-customizable way to add JSON checks to Nagios. We needed more than simple `foo.bar.baz == 'zerp'` checks. We found ourselves wanting to write simple JavaScript to evaluate API responses. `jsoneval` allows this.

Here are a couple examples.

Check ElasticSearch cluster health
----------------------------------

    define command{
        command_name    check_es_cluster_health
        command_line    /opt/node/bin/node /usr/lib/nagios/plugins/nagios-jsoneval/jsoneval.js -u http://$HOSTADDRESS$:$ARG1$/_cluster/health -e 'json.status' -t 'green'
    }

    define service {
        use                     generic-service
        hostgroup_name          elasticsearch-servers
        service_description     ElasticSearch Cluster Health
        check_command           check_es_cluster_health!9200
    }


This will trigger critical status if your cluster is yellow or red (not green).


Check RabbitMQ queue length
---------------------------

First, you'll need the [RabbitMQ Management Plugin](http://www.rabbitmq.com/management.html) enabled, and a user with appropriate permissions.

    define host{
        name servicenode-template
        register 0
        use generic-host
        hostgroups generic-hosts, rabbitmq-servers
        _rabbitmq_user monitor
        _rabbitmq_pass monitor
    }

    define host{
        use servicenode-template
        host_name svc01
        address svc01.exmaple.com
    }

    define command{
        command_name    check_rabbitmq_queue_length
        command_line    /opt/node/bin/node /usr/lib/nagios/plugins/nagios-jsoneval/jsoneval.js -u http://$_HOSTRABBITMQ_USER$:$_HOSTRABBITMQ_PASS$@$HOSTADDRESS$:55672/api/queues -e 'json.forEach(function (q) {if (q.vhost == "$ARG1$" && q.name == "$ARG2$") { retval = q.messages }})' -c $ARG3$ -w $ARG4$
    }

    define service {
        use                     generic-service
        hostgroup_name          rabbitmq-servers
        service_description     RabbitMQ gimmebar:dropbox-worker queue length
        check_command           check_rabbitmq_queue_length!/gimmebar!dropbox-worker!100!25
    }

This checks the `dropbox-worker` queue in the `/gimmebar` vhost. A warning will be triggered at a queue length of 25, and a critical at 100.

Note that we've put the user and password into custom host variables, but they could also be loaded into your resources file and referenced as `$USER{N}$`.

Be careful with semi-colons (`;`) in Nagios commands. See the [note about `command_line`](http://nagios.sourceforge.net/docs/3_0/objectdefinitions.html#command).


