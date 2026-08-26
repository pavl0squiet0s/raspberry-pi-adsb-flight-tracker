#!/usr/bin/env perl
use strict;
use warnings;
use HTTP::Tiny;
use JSON::PP qw(decode_json);
use Time::HiRes qw(sleep time);

my ($url, $lat, $lon, $duration, $interval) = @ARGV;
$url      //= 'http://mamaloty:8080/data/aircraft.json';
$lat      //= 53.3811;
$lon      //= -1.4701;
$duration //= 180;
$interval //= 5;

my $pi = 4 * atan2(1, 1);
sub rad { $_[0] * $pi / 180 }
sub distance_km {
    my ($a_lat, $a_lon, $b_lat, $b_lon) = @_;
    my $dlat = rad($b_lat - $a_lat);
    my $dlon = rad($b_lon - $a_lon);
    my $x = sin($dlat/2)**2 + cos(rad($a_lat))*cos(rad($b_lat))*sin($dlon/2)**2;
    return 6371 * 2 * atan2(sqrt($x), sqrt(1-$x));
}
sub bearing {
    my ($a_lat, $a_lon, $b_lat, $b_lon) = map { rad($_) } @_;
    my $y = sin($b_lon-$a_lon) * cos($b_lat);
    my $x = cos($a_lat)*sin($b_lat) - sin($a_lat)*cos($b_lat)*cos($b_lon-$a_lon);
    my $deg = atan2($y,$x) * 180 / $pi;
    return ($deg + 360) % 360;
}
sub compass {
    my ($degrees) = @_;
    my @points = qw(N NE E SE S SW W NW);
    return $points[int(($degrees + 22.5) / 45) % 8];
}

my $http = HTTP::Tiny->new(timeout => 5, verify_SSL => 0);
my (%max, %seen_hex);
my ($snapshots, $failures, $position_reports) = (0, 0, 0);
my $start = time;
my $next_report = 30;

while (time - $start < $duration) {
    my $response = $http->get($url);
    if ($response->{success}) {
        my $data = eval { decode_json($response->{content}) };
        if ($data) {
            $snapshots++;
            for my $a (@{$data->{aircraft} // []}) {
                next unless defined $a->{lat} && defined $a->{lon};
                next if ($a->{seen_pos} // 999) > 15;
                my $hex = $a->{hex} // next;
                $seen_hex{$hex} = 1;
                $position_reports++;
                my $distance = distance_km($lat, $lon, $a->{lat}, $a->{lon});
                next if exists $max{$hex} && $max{$hex}{distance} >= $distance;
                $max{$hex} = {
                    distance => $distance,
                    bearing => bearing($lat, $lon, $a->{lat}, $a->{lon}),
                    flight => ($a->{flight} // $hex),
                    altitude_m => defined $a->{alt_baro} ? $a->{alt_baro} * 0.3048 : undef,
                    lat => $a->{lat}, lon => $a->{lon},
                };
            }
        } else { $failures++ }
    } else { $failures++ }
    my $elapsed = time - $start;
    if ($elapsed >= $next_report) {
        my $furthest = (sort { $b->{distance} <=> $a->{distance} } values %max)[0];
        printf "PROGRESS %ds aircraft=%d max=%.1fkm %s\n", $elapsed, scalar(keys %seen_hex),
            ($furthest ? $furthest->{distance} : 0), ($furthest ? compass($furthest->{bearing}) : '-');
        $next_report += 30;
    }
    sleep $interval;
}

print "\nLIVE RANGE RESULT\n";
printf "duration=%ds snapshots=%d failures=%d unique_aircraft=%d position_reports=%d\n",
    $duration, $snapshots, $failures, scalar(keys %seen_hex), $position_reports;
print "flight,maximum_km,bearing,altitude_m,latitude,longitude\n";
my @ranked = sort { $max{$b}{distance} <=> $max{$a}{distance} } keys %max;
for my $hex (@ranked[0 .. ($#ranked < 9 ? $#ranked : 9)]) {
    my $a = $max{$hex};
    printf "%s,%.1f,%03.0f%s,%s,%.5f,%.5f\n",
        $a->{flight} =~ s/\s+$//r, $a->{distance}, $a->{bearing}, compass($a->{bearing}),
        defined $a->{altitude_m} ? sprintf('%.0f',$a->{altitude_m}) : '-', $a->{lat}, $a->{lon};
}
